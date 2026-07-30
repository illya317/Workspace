import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { onlyOfficeDocumentKey, onlyOfficeDocumentType } from "../office-preview";
import type { TenantCompanyDocumentConfig } from "../tenant-config";
import {
  onlyOfficeSourceUrl,
  renderOnlyOfficeViewerResponse,
  signOnlyOfficeSourceToken,
  verifyOnlyOfficeSourceToken,
} from "./onlyoffice-viewer";
import { getTenantProfile, resolveTenantConfigPath } from "./tenant-config";

const SOURCE_TOKEN_OPTIONS = {
  issuer: "workspace-company-documents",
  audience: "company-office-source",
  expiration: "10m",
} as const;

type CompanyOfficeSourceClaims = {
  documentKey: string;
  checksumSha256: string;
};

function configuredDocument(documentKey: string): TenantCompanyDocumentConfig {
  const document = getTenantProfile().docs.companyDocuments.find((item) => item.key === documentKey);
  if (!document) throw new Error("Company document not found");
  return document;
}

async function loadedDocument(documentKey: string) {
  const document = configuredDocument(documentKey);
  const absolutePath = resolveTenantConfigPath(document.file);
  const [buffer, fileStat] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
  return {
    document,
    absolutePath,
    buffer,
    fileName: path.basename(absolutePath),
    extension: path.extname(absolutePath).slice(1).toLowerCase(),
    checksumSha256: createHash("sha256").update(buffer).digest("hex"),
    fileStat,
  };
}

export type TenantCompanyDocumentMetadata = {
  key: string;
  title: string;
  description: string;
  format: "office" | "paper";
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
};

export type TenantCompanyDocumentSource = TenantCompanyDocumentMetadata & {
  content: Uint8Array;
};

function tenantCompanyDocumentMetadata(
  document: TenantCompanyDocumentConfig,
  absolutePath: string,
  fileStat: { size: number; mtime: Date },
): TenantCompanyDocumentMetadata {
  return {
    key: document.key,
    title: document.title,
    description: document.description,
    format: document.format,
    fileName: path.basename(absolutePath),
    fileSizeBytes: fileStat.size,
    updatedAt: fileStat.mtime.toISOString(),
  };
}

export async function readTenantCompanyDocumentSource(documentKey: string): Promise<TenantCompanyDocumentSource> {
  const loaded = await loadedDocument(documentKey);
  return {
    ...tenantCompanyDocumentMetadata(loaded.document, loaded.absolutePath, loaded.fileStat),
    content: loaded.buffer,
  };
}

export async function listTenantCompanyDocumentMetadata(): Promise<TenantCompanyDocumentMetadata[]> {
  return Promise.all(getTenantProfile().docs.companyDocuments.map(async (document) => {
    const absolutePath = resolveTenantConfigPath(document.file);
    return tenantCompanyDocumentMetadata(document, absolutePath, await stat(absolutePath));
  }));
}

function officeError(message: string) {
  if (message === "Company document not found") return 404;
  if (message.includes("required") || message.includes("unavailable")) return 503;
  return 400;
}

export async function renderCompanyOfficeViewerResponse(input: {
  documentKey: string;
  request: Request;
}) {
  try {
    const loaded = await loadedDocument(input.documentKey);
    if (loaded.document.format !== "office" || !onlyOfficeDocumentType(loaded.extension)) {
      throw new Error("Office preview unavailable");
    }
    const token = await signOnlyOfficeSourceToken({
      documentKey: loaded.document.key,
      checksumSha256: loaded.checksumSha256,
    }, SOURCE_TOKEN_OPTIONS);
    const sourceUrl = onlyOfficeSourceUrl(input.request, `/api/integrations/onlyoffice/company-documents/${encodeURIComponent(loaded.document.key)}`);
    sourceUrl.searchParams.set("token", token);
    return await renderOnlyOfficeViewerResponse({
      title: loaded.document.title,
      extension: loaded.extension,
      documentKey: onlyOfficeDocumentKey(`company-${loaded.document.key}`, loaded.checksumSha256),
      sourceUrl: sourceUrl.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Office preview unavailable";
    return new Response(message, { status: officeError(message) });
  }
}

export async function verifyCompanyOfficeSourceToken(token: string): Promise<CompanyOfficeSourceClaims | null> {
  const payload = await verifyOnlyOfficeSourceToken(token, SOURCE_TOKEN_OPTIONS);
  if (!payload || typeof payload.documentKey !== "string" || typeof payload.checksumSha256 !== "string") return null;
  return payload as unknown as CompanyOfficeSourceClaims;
}

export async function serveCompanyOfficeSourceResponse(input: {
  documentKey: string;
  token: string;
}) {
  const claims = await verifyCompanyOfficeSourceToken(input.token);
  if (!claims || claims.documentKey !== input.documentKey) return new Response("Forbidden", { status: 403 });
  try {
    const loaded = await loadedDocument(input.documentKey);
    if (
      loaded.document.format !== "office"
      || loaded.checksumSha256 !== claims.checksumSha256
      || !onlyOfficeDocumentType(loaded.extension)
    ) throw new Error("Original Office source unavailable");
    return new Response(new Uint8Array(loaded.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(loaded.fileName)}`,
        "Content-Length": String(loaded.buffer.length),
        "Content-Type": officeMimeType(loaded.extension),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Original Office source unavailable", { status: 404 });
  }
}

function officeMimeType(extension: string) {
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "doc") return "application/msword";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "xls") return "application/vnd.ms-excel";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "ppt") return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
}
