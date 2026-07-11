import "server-only";

import { prisma } from "@workspace/platform/server/prisma";
import {
  getOpenApiEndpoints,
  getOpenApiRegistrations,
  getOpenApiResources,
  getOpenApiScopes,
} from "@workspace/platform/open-api-registry";
import { generateOpenApiSecret, hashOpenApiSecret } from "./crypto";

const SYNC_TTL_MS = 60_000;
let lastSyncAt = 0;

export async function ensureOpenApiRegistrySynced() {
  if (Date.now() - lastSyncAt < SYNC_TTL_MS) return;

  for (const resource of getOpenApiResources()) {
    await prisma.openApiResource.upsert({
      where: { key: resource.key },
      update: {
        label: resource.label,
        registrationKey: resource.registrationKey,
        runtimeParentResourceKey: resource.runtimeParentResourceKey,
        sortOrder: resource.sortOrder,
      },
      create: {
        key: resource.key,
        label: resource.label,
        registrationKey: resource.registrationKey,
        runtimeParentResourceKey: resource.runtimeParentResourceKey,
        sortOrder: resource.sortOrder,
      },
    });
  }

  for (const scope of getOpenApiScopes()) {
    const resource = await prisma.openApiResource.findUnique({
      where: { key: scope.resourceKey },
      select: { id: true },
    });
    if (!resource) throw new Error(`OPEN_API_RESOURCE_NOT_SYNCED:${scope.resourceKey}`);
    await prisma.openApiScope.upsert({
      where: { key: scope.key },
      update: {
        label: scope.label,
        action: scope.action,
        resourceId: resource.id,
        registrationKey: scope.registrationKey,
        runtimeParentResourceKey: scope.runtimeParentResourceKey,
        sortOrder: scope.sortOrder,
      },
      create: {
        key: scope.key,
        label: scope.label,
        action: scope.action,
        resourceId: resource.id,
        registrationKey: scope.registrationKey,
        runtimeParentResourceKey: scope.runtimeParentResourceKey,
        sortOrder: scope.sortOrder,
      },
    });
  }

  lastSyncAt = Date.now();
}

export async function listOpenApiConsoleData() {
  await ensureOpenApiRegistrySynced();
  const [clients, scopes, logs] = await Promise.all([
    prisma.openApiClient.findMany({
      orderBy: { createdAt: "desc" },
      include: { grants: { include: { scope: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.openApiScope.findMany({ orderBy: [{ registrationKey: "asc" }, { sortOrder: "asc" }] }),
    prisma.openApiAccessLog.findMany({ orderBy: { createdAt: "desc" }, take: 80 }),
  ]);

  return {
    registrations: getOpenApiRegistrations(),
    endpoints: getOpenApiEndpoints(),
    scopes,
    clients: clients.map((client) => ({
      id: client.id,
      name: client.name,
      description: client.description,
      status: client.status,
      ownerUserId: client.ownerUserId,
      expiresAt: client.expiresAt?.toISOString() ?? null,
      lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      scopeKeys: client.grants.map((grant) => grant.scope.key),
    })),
    logs: logs.map((log) => ({
      id: log.id,
      clientId: log.clientId,
      clientName: log.clientName,
      endpointKey: log.endpointKey,
      scopeKey: log.scopeKey,
      method: log.method,
      path: log.path,
      status: log.status,
      durationMs: log.durationMs,
      errorCode: log.errorCode,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

export async function createOpenApiClient(input: {
  name: string;
  description?: string | null;
  expiresAt?: string | null;
  ownerUserId?: number | null;
}) {
  await ensureOpenApiRegistrySynced();
  const secret = generateOpenApiSecret();
  const client = await prisma.openApiClient.create({
    data: {
      name: input.name,
      description: input.description?.trim() || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      ownerUserId: input.ownerUserId ?? null,
      keyHash: hashOpenApiSecret(secret),
    },
  });
  return { client, secret };
}

export function toOpenApiClientSummary(client: {
  id: number;
  name: string;
  description: string | null;
  status: string;
  ownerUserId: number | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: client.id,
    name: client.name,
    description: client.description,
    status: client.status,
    ownerUserId: client.ownerUserId,
    expiresAt: client.expiresAt?.toISOString() ?? null,
    lastUsedAt: client.lastUsedAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    scopeKeys: [] as string[],
  };
}

export async function rotateOpenApiClientSecret(clientId: number) {
  const secret = generateOpenApiSecret();
  const client = await prisma.openApiClient.update({
    where: { id: clientId },
    data: { keyHash: hashOpenApiSecret(secret) },
  });
  return { client, secret };
}

export async function updateOpenApiClientScopes(clientId: number, scopeKeys: string[]) {
  await ensureOpenApiRegistrySynced();
  const existing = await prisma.openApiClient.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!existing) throw new Error(`OPEN_API_CLIENT_NOT_FOUND:${clientId}`);

  const uniqueScopeKeys = [...new Set(scopeKeys)];
  const scopes = await prisma.openApiScope.findMany({
    where: { key: { in: uniqueScopeKeys } },
    select: { id: true, key: true, action: true },
  });
  if (scopes.length !== uniqueScopeKeys.length) {
    const found = new Set(scopes.map((scope) => scope.key));
    const missing = uniqueScopeKeys.filter((key) => !found.has(key));
    throw new Error(`OPEN_API_SCOPE_NOT_FOUND:${missing.join(",")}`);
  }

  await prisma.$transaction([
    prisma.openApiClientScopeGrant.deleteMany({ where: { clientId } }),
    ...scopes.map((scope) =>
      prisma.openApiClientScopeGrant.create({
        data: { clientId, scopeId: scope.id, action: scope.action },
      }),
    ),
  ]);
}

export async function recordOpenApiAccess(input: {
  clientId?: number | null;
  clientName?: string | null;
  endpointKey: string;
  scopeKey: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  errorCode?: string | null;
  ip?: string | null;
}) {
  await prisma.openApiAccessLog.create({ data: input }).catch(() => undefined);
}

export async function touchOpenApiClient(clientId: number) {
  await prisma.openApiClient.update({
    where: { id: clientId },
    data: { lastUsedAt: new Date() },
  }).catch(() => undefined);
}

export async function findOpenApiClientBySecret(secret: string) {
  await ensureOpenApiRegistrySynced();
  return prisma.openApiClient.findUnique({
    where: { keyHash: hashOpenApiSecret(secret) },
    include: { grants: { include: { scope: true } } },
  });
}
