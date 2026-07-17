import "server-only";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { SignJWT, jwtVerify } from "jose";

import { libraryOfficeDocumentType } from "@workspace/library/constants";
import { prisma } from "@workspace/platform/server/prisma";

import { checkLibraryRead, getMaxConfidentialityLevel } from "./permissions";
import {
  libraryOfficeDocumentKey,
  renderLibraryOnlyOfficeHtml,
} from "./onlyoffice-contract";
import { resolveLibraryVersionProcessingInput } from "./version-content";

const SOURCE_TOKEN_ISSUER = "workspace-library";
const SOURCE_TOKEN_AUDIENCE = "library-office-source";
const SOURCE_TOKEN_EXPIRATION = "10m";

type OfficeSourceClaims = {
  documentId: number;
  versionId: number;
  versionUid: string;
  checksumSha256: string;
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
  return encodedSecret(process.env.NEXTAUTH_SECRET, "NEXTAUTH_SECRET", "library-office-source-dev-only");
}

function basePath() {
  const configured = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  return configured === "/" ? "" : `/${configured.replace(/^\/+|\/+$/g, "")}`;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function requestOrigin(request: Request) {
  const configured = process.env.WORKSPACE_PUBLIC_ORIGIN?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WORKSPACE_PUBLIC_ORIGIN is required");
  }
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (forwardedHost) return new URL(`${forwardedProto || "https"}://${forwardedHost}`).origin;
  return new URL(request.url).origin;
}

function officeError(message: string) {
  if (message === "Forbidden" || message === "Higher confidentiality required") return 403;
  if (message === "Not found" || message === "Version not found") return 404;
  if (message.includes("required") || message.includes("unavailable")) return 503;
  return 400;
}

async function loadOfficeVersion(documentId: number, versionId: number, userId: number) {
  if (!(await checkLibraryRead(userId))) throw new Error("Forbidden");
  const version = await prisma.libraryDocumentVersion.findFirst({
    where: { id: versionId, documentId },
    select: {
      id: true,
      versionUid: true,
      fileName: true,
      extension: true,
      checksumSha256: true,
      document: {
        select: {
          status: true,
          title: true,
          confidentialityLevel: true,
        },
      },
    },
  });
  if (!version) throw new Error("Version not found");
  if (version.document.status !== "active") throw new Error("Office preview unavailable");
  const maxLevel = await getMaxConfidentialityLevel(userId);
  if (version.document.confidentialityLevel > maxLevel) throw new Error("Higher confidentiality required");
  if (!version.checksumSha256 || !libraryOfficeDocumentType(version.extension)) {
    throw new Error("Office preview unavailable");
  }
  return version;
}

async function sourceToken(claims: OfficeSourceClaims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SOURCE_TOKEN_ISSUER)
    .setAudience(SOURCE_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(SOURCE_TOKEN_EXPIRATION)
    .sign(sourceTokenSecret());
}

async function signedEditorConfig(config: Record<string, unknown>) {
  return new SignJWT(config)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(onlyOfficeSecret());
}

export async function verifyLibraryOfficeSourceToken(token: string): Promise<OfficeSourceClaims | null> {
  try {
    const { payload } = await jwtVerify(token, sourceTokenSecret(), {
      issuer: SOURCE_TOKEN_ISSUER,
      audience: SOURCE_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
      clockTolerance: 30,
    });
    if (
      !Number.isInteger(payload.documentId)
      || !Number.isInteger(payload.versionId)
      || typeof payload.versionUid !== "string"
      || typeof payload.checksumSha256 !== "string"
    ) return null;
    return payload as unknown as OfficeSourceClaims;
  } catch {
    return null;
  }
}

export async function renderLibraryOfficeViewerResponse(input: {
  documentId: number;
  versionId: number;
  userId: number;
  request: Request;
}) {
  try {
    const version = await loadOfficeVersion(input.documentId, input.versionId, input.userId);
    const documentType = libraryOfficeDocumentType(version.extension);
    if (!documentType || !version.checksumSha256) throw new Error("Office preview unavailable");
    const token = await sourceToken({
      documentId: input.documentId,
      versionId: version.id,
      versionUid: version.versionUid,
      checksumSha256: version.checksumSha256,
    });
    const sourceUrl = new URL(
      `${basePath()}/api/integrations/onlyoffice/library-documents/${input.documentId}/versions/${version.id}`,
      requestOrigin(input.request),
    );
    sourceUrl.searchParams.set("token", token);
    const config: Record<string, unknown> = {
      document: {
        fileType: version.extension?.toLowerCase(),
        key: libraryOfficeDocumentKey(version.versionUid, version.checksumSha256),
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
        title: version.document.title || version.fileName,
        url: sourceUrl.toString(),
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
    const html = renderLibraryOnlyOfficeHtml({
      title: `${version.document.title || version.fileName} - Office 预览`,
      apiScriptPath: `${basePath()}/onlyoffice/web-apps/apps/api/documents/api.js`,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Office preview unavailable";
    return new Response(message, { status: officeError(message) });
  }
}

export async function serveLibraryOfficeSourceResponse(input: {
  documentId: number;
  versionId: number;
  token: string;
}) {
  const claims = await verifyLibraryOfficeSourceToken(input.token);
  if (!claims || claims.documentId !== input.documentId || claims.versionId !== input.versionId) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const resolved = await resolveLibraryVersionProcessingInput(claims.versionUid);
    if (
      resolved.version.id !== input.versionId
      || resolved.version.documentId !== input.documentId
      || resolved.input.checksumSha256 !== claims.checksumSha256
      || resolved.version.checksumSha256 !== claims.checksumSha256
      || !libraryOfficeDocumentType(resolved.version.extension)
    ) throw new Error("Original Office source unavailable");
    const buffer = await readFile(resolved.input.absolutePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(resolved.version.fileName)}`,
        "Content-Length": String(buffer.length),
        "Content-Type": resolved.input.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Original Office source unavailable", { status: 404 });
  }
}
