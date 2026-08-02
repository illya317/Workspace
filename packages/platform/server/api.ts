import { NextResponse } from "next/server";
import { z } from "zod";

import type { ServiceResult } from "../service-result";
import type { DomainValidationIssue } from "./domain-validation";
import { workspaceInternalOrigin } from "./internal-unit-rpc";

export {
  isPlatformServiceResult,
  isServiceResult,
  serviceError,
  serviceOk,
  type ServiceErrorDetails,
  type ServiceResult,
} from "../service-result";

export function domainIssueToResponse(issue: DomainValidationIssue) {
  const details = {
    ...issue.details,
    ...(issue.field ? { field: issue.field } : {}),
  };
  return jsonErrorResponse(
    issue.message,
    issue.status ?? 400,
    Object.keys(details).length > 0 ? details : undefined,
  );
}

export function toServiceErrorResponse(result: { error: string; status?: number; details?: Record<string, unknown> }) {
  return serviceResponse({
    ok: false,
    error: result.error,
    status: result.status,
    details: result.details,
  });
}

export type ParsedJson<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<ParsedJson<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "请求体必须是合法 JSON" };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: first?.message || "参数校验失败" };
  }

  return { ok: true, data: result.data };
}

const passthroughBodySchema = z.object({}).passthrough();

export const routeIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const routeStringIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const updateFieldBodySchema = z.object({
  field: z.string().min(1),
  value: z.unknown().optional(),
}).passthrough();

export const updateFieldsBodySchema = z.object({
  changes: z.array(z.object({
    id: z.coerce.number().int().positive(),
    field: z.string().min(1),
    value: z.unknown().optional(),
  })).min(1).max(500),
});

export const rowsRequestBodySchema = z.object({
  rows: z.unknown().optional(),
}).passthrough();

export function readRequestExpectedVersion(request: Request) {
  const ifMatch = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^\"|\"$/g, "");
  const raw = request.headers.get("x-record-version")
    ?? ifMatch
    ?? new URL(request.url).searchParams.get("version");
  if (raw === null || raw === undefined || raw === "") return undefined;
  const version = Number(raw);
  return Number.isInteger(version) && version >= 0 ? version : undefined;
}

export async function parseRouteId(params?: Promise<Record<string, string>>) {
  if (!params) return null;
  const parsedParams = routeIdParamsSchema.safeParse(await params);
  return parsedParams.success ? parsedParams.data.id : null;
}

export async function parseRouteIdParams(params?: Promise<Record<string, string>>) {
  const id = await parseRouteId(params);
  return id === null ? null : { id: String(id) };
}

export function jsonBadRequest(error: unknown) {
  return NextResponse.json({ error }, { status: 400 });
}

export function jsonErrorResponse(error: unknown, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export function serviceResponse<T>(result: ServiceResult<T>) {
  if (result.ok) return NextResponse.json(result.data);
  return jsonErrorResponse(result.error, result.status ?? 400, result.details);
}

export function jsonResultResponse<T extends object>(result: T) {
  if ("error" in result) {
    const { error, status, ...rest } = result as Record<string, unknown>;
    return Response.json(
      { error, ...rest },
      { status: typeof status === "number" ? status : 400 },
    );
  }

  return Response.json(result);
}

export type IdRouteContext = {
  params: Promise<{ id: string }>;
};

export function createProxyHandler(targetPathPrefix: string) {
  return async function handler(
    request: Request,
    { params }: IdRouteContext,
  ) {
    const { id } = await params;
    const url = new URL(`${targetPathPrefix}/${id}`, request.url);

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");

    const requestInit: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
      requestInit.body = request.body;
      requestInit.duplex = "half";
    }

    const res = await fetch(url, requestInit);

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}

export function createValidatedIdProxyHandler(targetPathPrefix: string, invalidIdError = "ID 无效") {
  const proxy = createProxyHandler(targetPathPrefix);

  return async function handler(request: Request, { params }: IdRouteContext) {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return jsonErrorResponse(invalidIdError, 400);
    }

    return proxy(request, { params: Promise.resolve({ id: String(parsedParams.data.id) }) });
  };
}

export type CompatibilityProxyOptions = {
  defaultPageSize?: number;
  sourcePathPrefix?: string;
};

export function createCompatibilityProxyHandler(
  targetPath: string,
  options: CompatibilityProxyOptions = {},
) {
  return async function handler(request: Request) {
    const sourceUrl = new URL(request.url);
    const target = options.sourcePathPrefix
      ? new URL(`${sourceUrl.pathname}${sourceUrl.search}`, workspaceInternalOrigin())
      : new URL(targetPath, workspaceInternalOrigin());
    if (options.sourcePathPrefix) {
      if (!target.pathname.includes(options.sourcePathPrefix)) {
        return jsonErrorResponse("Compatibility proxy path mismatch", 500);
      }
      target.pathname = target.pathname.replace(options.sourcePathPrefix, targetPath);
    }
    target.search = sourceUrl.search;
    if (options.defaultPageSize !== undefined && !sourceUrl.searchParams.has("pageSize")) {
      target.searchParams.set("pageSize", String(options.defaultPageSize));
    }

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");

    const requestInit: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
      requestInit.body = request.body;
      requestInit.duplex = "half";
    }

    const response = await fetch(target, requestInit);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

export async function validateCompatibilityProxyBody(request: Request): Promise<ParsedJson<Record<string, unknown>>> {
  return validatePassthroughBody(request);
}

export async function validatePassthroughBody(request: Request): Promise<ParsedJson<Record<string, unknown>>> {
  if (!["POST", "PUT", "PATCH"].includes(request.method.toUpperCase())) {
    return { ok: true, data: {} };
  }

  return parseJson(request.clone(), passthroughBodySchema);
}

export function isValidDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === monthIndex &&
    parsed.getDate() === day
  );
}

export function rejectInvalidDateField(field: string, value: unknown, dateFields: readonly string[]) {
  if (dateFields.includes(field) && !isValidDateValue(value)) return null;
  return { field, value };
}
