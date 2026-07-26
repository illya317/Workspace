import "server-only";

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import {
  onlyOfficeDocumentType,
  renderOnlyOfficeHtml,
} from "../office-preview";

type SourceTokenOptions = {
  issuer: string;
  audience: string;
  expiration?: string;
};

function encodedSecret(value: string | undefined, name: string, developmentFallback?: string) {
  const secret = value?.trim() || (process.env.NODE_ENV === "production" ? "" : developmentFallback);
  if (!secret) throw new Error(`${name} is required`);
  return new TextEncoder().encode(secret);
}

function onlyOfficeSecret() {
  return encodedSecret(process.env.ONLYOFFICE_JWT_SECRET, "ONLYOFFICE_JWT_SECRET");
}

function sourceTokenSecret() {
  return encodedSecret(process.env.NEXTAUTH_SECRET, "NEXTAUTH_SECRET", "onlyoffice-source-dev-only");
}

export function onlyOfficeBasePath() {
  const configured = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  return configured === "/" ? "" : `/${configured.replace(/^\/+|\/+$/g, "")}`;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestOrigin(request: Request) {
  const configured = process.env.WORKSPACE_PUBLIC_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") throw new Error("WORKSPACE_PUBLIC_ORIGIN is required");
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (forwardedHost) return new URL(`${forwardedProto || "https"}://${forwardedHost}`).origin;
  return new URL(request.url).origin;
}

export function onlyOfficeSourceUrl(request: Request, path: string) {
  return new URL(`${onlyOfficeBasePath()}${path}`, requestOrigin(request));
}

export async function signOnlyOfficeSourceToken(
  claims: Record<string, unknown>,
  options: SourceTokenOptions,
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setIssuedAt()
    .setExpirationTime(options.expiration ?? "10m")
    .sign(sourceTokenSecret());
}

export async function verifyOnlyOfficeSourceToken(token: string, options: SourceTokenOptions): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, sourceTokenSecret(), {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    return payload;
  } catch {
    return null;
  }
}

async function signedEditorConfig(config: Record<string, unknown>) {
  return new SignJWT(config)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(onlyOfficeSecret());
}

export async function renderOnlyOfficeViewerResponse(input: {
  title: string;
  extension: string;
  documentKey: string;
  sourceUrl: string;
}) {
  const documentType = onlyOfficeDocumentType(input.extension);
  if (!documentType) throw new Error("Office preview unavailable");
  const config: Record<string, unknown> = {
    document: {
      fileType: input.extension.toLowerCase(),
      key: input.documentKey,
      permissions: {
        chat: false,
        comment: false,
        copy: false,
        download: false,
        edit: false,
        fillForms: false,
        print: false,
        review: false,
      },
      title: input.title,
      url: input.sourceUrl,
    },
    documentType,
    editorConfig: {
      lang: "zh-CN",
      mode: "view",
      customization: {
        autosave: false,
        comments: false,
        compactHeader: true,
        compactToolbar: true,
        feedback: false,
        forcesave: false,
        help: false,
        plugins: false,
      },
    },
    height: "100%",
    type: "desktop",
    width: "100%",
  };
  config.token = await signedEditorConfig(config);
  const nonce = randomBytes(18).toString("base64url");
  const html = renderOnlyOfficeHtml({
    title: `${input.title} - Office 预览`,
    apiScriptPath: `${onlyOfficeBasePath()}/onlyoffice/web-apps/apps/api/documents/api.js`,
    nonce,
    config,
  });
  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; font-src 'self' data:`,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
