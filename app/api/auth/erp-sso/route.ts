import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RES } from "@/lib/permissions";
import { authenticate } from "@/server/auth/authenticate";
import { checkPermission } from "@/server/rbac/check";

export const dynamic = "force-dynamic";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const DEFAULT_ERP_SSO_URL = "/erp/api/method/my_erp.api.workspace_sso.login";
const DEFAULT_ERP_REDIRECT_TO = "/erp/app";

function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function redirectToLogin(request: Request) {
  return NextResponse.redirect(new URL(`${getRequestOrigin(request)}${BASE_PATH}/login`));
}

function safeErpRedirect(value: string | null) {
  const fallback = process.env.WORKSPACE_ERP_REDIRECT_TO || DEFAULT_ERP_REDIRECT_TO;
  const redirectTo = (value || fallback).trim();
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) return fallback;
  return redirectTo;
}

function getSsoSecret() {
  const secret = process.env.WORKSPACE_ERP_SSO_SECRET;
  if (!secret) throw new Error("WORKSPACE_ERP_SSO_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

async function createErpSsoToken(user: {
  id: number;
  name: string;
  erpnextUserId: string | null;
  erpnextUsername: string | null;
}) {
  const erpUser = user.erpnextUserId || user.erpnextUsername;
  if (!erpUser) throw new Error("ERPNEXT_USER_NOT_BOUND");

  return new SignJWT({
    erpnext_user: erpUser,
    erpnextUserId: user.erpnextUserId,
    erpnextUsername: user.erpnextUsername,
    userId: user.id,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(process.env.WORKSPACE_ERP_SSO_ISSUER || "workspace")
    .setAudience(process.env.WORKSPACE_ERP_SSO_AUDIENCE || "erp")
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSsoSecret());
}

function buildErpSsoUrl(request: Request, token: string, redirectTo: string) {
  const rawUrl = process.env.WORKSPACE_ERP_SSO_URL || DEFAULT_ERP_SSO_URL;
  const url = new URL(rawUrl, getRequestOrigin(request));
  url.searchParams.set("token", token);
  url.searchParams.set("redirect_to", redirectTo);
  return url;
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return redirectToLogin(request);

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      name: true,
      canLogin: true,
      erpnextUserId: true,
      erpnextUsername: true,
    },
  });

  if (!user?.canLogin) return redirectToLogin(request);
  if (!(await checkPermission(user.id, RES.system.erpnext, "access"))) {
    return NextResponse.json({ error: "无权限访问 ERPNext" }, { status: 403 });
  }

  try {
    const requestUrl = new URL(request.url);
    const redirectTo = safeErpRedirect(requestUrl.searchParams.get("redirect_to"));
    const token = await createErpSsoToken(user);
    return NextResponse.redirect(buildErpSsoUrl(request, token, redirectTo));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERP SSO failed";
    const status = message === "ERPNEXT_USER_NOT_BOUND" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
