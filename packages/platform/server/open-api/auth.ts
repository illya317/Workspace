import "server-only";

import { findOpenApiEndpoint, getOpenApiScope, type OpenApiAction, type OpenApiMethod } from "@workspace/platform/open-api-registry";
import { isResourceEnabled, getDisabledReasonForResource } from "@workspace/platform/effective-module-registry";
import { moduleDisabledResponse } from "@workspace/platform/server/module-runtime";
import {
  findOpenApiClientBySecret,
  recordOpenApiAccess,
  touchOpenApiClient,
} from "./management";
import { jsonErrorResponse } from "../api";

type OpenApiClientForHandler = {
  id: number;
  name: string;
};

type OpenApiHandlerContext = {
  client: OpenApiClientForHandler;
  scopeKey: string;
  endpointKey: string;
};

type OpenApiRouteContext = { params?: Promise<Record<string, string>> };

type OpenApiHandler = (
  request: Request,
  context: OpenApiHandlerContext,
  routeContext?: OpenApiRouteContext,
) => Promise<Response>;

function jsonError(error: string, status: number) {
  return jsonErrorResponse(error, status);
}

function readBearerSecret(request: Request) {
  const authorization = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? null;
}

async function logAndReturn(input: {
  request: Request;
  endpointKey: string;
  scopeKey: string;
  startedAt: number;
  status: number;
  errorCode: string;
  client?: OpenApiClientForHandler | null;
}) {
  const url = new URL(input.request.url);
  await recordOpenApiAccess({
    clientId: input.client?.id ?? null,
    clientName: input.client?.name ?? null,
    endpointKey: input.endpointKey,
    scopeKey: input.scopeKey,
    method: input.request.method,
    path: url.pathname,
    status: input.status,
    durationMs: Date.now() - input.startedAt,
    errorCode: input.errorCode,
    ip: getRequestIp(input.request),
  });
  return jsonError(input.errorCode, input.status);
}

export function withOpenApiScope(
  scopeKey: string,
  action: OpenApiAction,
  handler: OpenApiHandler,
) {
  return async function openApiRoute(request: Request, routeContext?: OpenApiRouteContext) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const endpointMatch = findOpenApiEndpoint(request.method as OpenApiMethod, url.pathname);
    const endpointKey = endpointMatch?.endpoint.key ?? "unknown";

    if (!endpointMatch || endpointMatch.endpoint.scopeKey !== scopeKey || endpointMatch.endpoint.action !== action) {
      return logAndReturn({
        request,
        endpointKey,
        scopeKey,
        startedAt,
        status: 404,
        errorCode: "OPEN_API_ENDPOINT_NOT_REGISTERED",
      });
    }

    const runtimeParentResourceKey = endpointMatch.registration.runtimeParentResourceKey;
    if (!isResourceEnabled(runtimeParentResourceKey)) {
      return moduleDisabledResponse(runtimeParentResourceKey, getDisabledReasonForResource(runtimeParentResourceKey));
    }

    const secret = readBearerSecret(request);
    if (!secret) {
      return logAndReturn({
        request,
        endpointKey,
        scopeKey,
        startedAt,
        status: 401,
        errorCode: "OPEN_API_SECRET_REQUIRED",
      });
    }

    const client = await findOpenApiClientBySecret(secret);
    if (!client || client.status !== "active" || (client.expiresAt && client.expiresAt.getTime() <= Date.now())) {
      return logAndReturn({
        request,
        endpointKey,
        scopeKey,
        startedAt,
        status: 401,
        errorCode: "OPEN_API_CLIENT_INVALID",
      });
    }

    const scope = getOpenApiScope(scopeKey);
    const hasScope = client.grants.some((grant) => grant.scope.key === scopeKey && grant.action === action);
    if (!scope || !hasScope) {
      return logAndReturn({
        request,
        endpointKey,
        scopeKey,
        startedAt,
        status: 403,
        errorCode: "OPEN_API_SCOPE_FORBIDDEN",
        client,
      });
    }

    const response = await handler(
      request,
      { client: { id: client.id, name: client.name }, scopeKey, endpointKey },
      routeContext,
    );
    await recordOpenApiAccess({
      clientId: client.id,
      clientName: client.name,
      endpointKey,
      scopeKey,
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
      ip: getRequestIp(request),
    });
    void touchOpenApiClient(client.id);
    return response;
  };
}
