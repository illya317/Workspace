import "server-only";

import { NextResponse } from "next/server";

import { jsonErrorResponse } from "../api";
import { createInternalApiRoute } from "../api-route";
import { getSessionUserFromAuthPayload } from "../auth";
import {
  callWorkspaceInternalJson,
  isWorkspaceInternalRequestAuthorized,
  WorkspaceInternalRpcError,
} from "../internal-unit-rpc";
import { resolveAgentToolAccess } from "./capabilities";
import { resolveStoredAgentExecutionContext } from "./execution-context";
import type { AgentExecutionContext } from "./execution";
import type { ProposalExecutor, ProposalExecutorControl, ProposalExecutors } from "./proposals";
import type { AgentTool } from "./tools";

type AgentDomainUnitId = "finance" | "hr" | "library" | "work";
type AgentDomainCatalogName = "default" | "wecom";

type RemoteToolDefinition = Omit<AgentTool, "execute">;
type RemoteProposalExecutorDefinition = Omit<ProposalExecutor, "execute">;

type RemoteDomainCatalog = {
  schemaVersion: 1;
  kind: "workspace-agent-domain-catalog";
  unitId: AgentDomainUnitId;
  catalog: AgentDomainCatalogName;
  tools: RemoteToolDefinition[];
  proposalExecutors: Record<string, RemoteProposalExecutorDefinition>;
};

type ExecutionIdentity = {
  requesterId: number;
  actorId: number;
  profileId: number | null;
  runId?: string;
};

type AgentDomainRpcConfig = {
  unitId: AgentDomainUnitId;
  catalogs: Partial<Record<AgentDomainCatalogName, AgentTool[]>> & { default: AgentTool[] };
  proposalExecutors?: ProposalExecutors;
};

const AGENT_DOMAIN_UNITS: readonly AgentDomainUnitId[] = ["finance", "hr", "library", "work"];
const catalogCache = new Map<string, { expiresAt: number; value: RemoteDomainCatalog }>();
const CATALOG_TTL_MS = 5_000;

function serializeTool(tool: AgentTool): RemoteToolDefinition {
  const { execute: _execute, ...definition } = tool;
  return definition;
}

function serializeExecutor(executor: ProposalExecutor): RemoteProposalExecutorDefinition {
  const { execute: _execute, ...definition } = executor;
  return definition;
}

function catalog(config: AgentDomainRpcConfig, name: AgentDomainCatalogName): RemoteDomainCatalog {
  const tools = config.catalogs[name] ?? config.catalogs.default;
  return {
    schemaVersion: 1,
    kind: "workspace-agent-domain-catalog",
    unitId: config.unitId,
    catalog: name,
    tools: tools.map(serializeTool),
    proposalExecutors: Object.fromEntries(Object.entries(config.proposalExecutors ?? {}).map(
      ([actionKey, executor]) => [actionKey, serializeExecutor(executor)],
    )),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function executionIdentity(value: unknown): ExecutionIdentity | null {
  const input = record(value);
  if (!input) return null;
  const requesterId = positiveInteger(input.requesterId);
  const actorId = positiveInteger(input.actorId);
  const profileId = input.profileId === null ? null : positiveInteger(input.profileId);
  if (!requesterId || !actorId || (input.profileId !== null && !profileId)) return null;
  return {
    requesterId,
    actorId,
    profileId,
    runId: typeof input.runId === "string" && input.runId ? input.runId : undefined,
  };
}

async function resolveExecution(identity: ExecutionIdentity) {
  const requester = await getSessionUserFromAuthPayload({
    userId: identity.requesterId,
    wxUserId: "",
    departmentId: 0,
  });
  if (!requester) throw new Error("Agent requester no longer exists or cannot sign in");
  const execution = await resolveStoredAgentExecutionContext(requester, identity.actorId, identity.profileId);
  return identity.runId ? { ...execution, runId: identity.runId } : execution;
}

function executorAsTool(executor: ProposalExecutor): AgentTool {
  return {
    key: executor.toolKey,
    label: executor.toolKey,
    description: "Remote Agent proposal authorization sentinel",
    requiredPermissions: executor.requiredPermissions,
    policyActions: executor.policyActions,
    delegatedExecution: executor.delegatedExecution,
    requiresAgentProfile: executor.requiresAgentProfile,
    mutates: true,
    execute: async () => ({ type: "error", message: "authorization sentinel" }),
  };
}

async function executeTool(
  config: AgentDomainRpcConfig,
  body: Record<string, unknown>,
  execution: AgentExecutionContext,
) {
  const catalogName = body.catalog === "wecom" ? "wecom" : "default";
  const tools = config.catalogs[catalogName] ?? config.catalogs.default;
  const tool = tools.find((candidate) => candidate.key === body.toolKey);
  if (!tool) throw new Error(`Unknown ${config.unitId} Agent tool: ${String(body.toolKey)}`);
  const access = await resolveAgentToolAccess(execution, [tool]);
  if (access.tools.length !== 1) throw new Error("Agent tool permission is no longer valid");
  return tool.execute(record(body.params) ?? {}, access.execution ?? execution);
}

async function executeProposal(
  config: AgentDomainRpcConfig,
  body: Record<string, unknown>,
  execution: AgentExecutionContext,
) {
  const actionKey = typeof body.actionKey === "string" ? body.actionKey : "";
  const executor = config.proposalExecutors?.[actionKey];
  if (!executor) throw new Error(`Unknown ${config.unitId} Agent proposal action: ${actionKey}`);
  const access = await resolveAgentToolAccess(execution, [executorAsTool(executor)]);
  if (access.tools.length !== 1) throw new Error("Agent proposal permission is no longer valid");
  let sideEffectStarted = false;
  const control: ProposalExecutorControl = {
    markExternalDispatchStarted() {
      sideEffectStarted = true;
    },
  };
  try {
    return {
      result: await executor.execute(record(body.payload) ?? {}, access.execution ?? execution, control),
      sideEffectStarted,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      sideEffectStarted,
    };
  }
}

export function createAgentDomainRpcHandler(config: AgentDomainRpcConfig) {
  return createInternalApiRoute({
    authorize: async ({ request }) => {
      const rawBody = await request.clone().text();
      return isWorkspaceInternalRequestAuthorized(request, rawBody, {
        allowedCallerUnitIds: ["assistant"],
        audienceUnitId: config.unitId,
      });
    },
    authorizeError: "Internal service authentication failed",
    handler: async ({ request }) => {
    const rawBody = await request.text();
    const body = record(await Promise.resolve().then(() => JSON.parse(rawBody)).catch(() => null));
    if (!body) return jsonErrorResponse("Invalid Agent domain RPC request", 400);
    try {
      if (body.operation === "catalog") {
        return NextResponse.json(catalog(config, body.catalog === "wecom" ? "wecom" : "default"));
      }
      const identity = executionIdentity(body.execution);
      if (!identity) return jsonErrorResponse("Invalid Agent execution identity", 400);
      const execution = await resolveExecution(identity);
      if (body.operation === "tool.execute") {
        return NextResponse.json(await executeTool(config, body, execution));
      }
      if (body.operation === "proposal.execute") {
        const response = await executeProposal(config, body, execution);
        return "error" in response
          ? NextResponse.json(response, { status: 500 })
          : NextResponse.json(response);
      }
      return jsonErrorResponse("Unsupported Agent domain RPC operation", 400);
    } catch (error) {
      return jsonErrorResponse(error instanceof Error ? error.message : "Agent domain RPC failed", 500);
    }
    },
  });
}

function identity(execution: AgentExecutionContext): ExecutionIdentity {
  return {
    requesterId: execution.requester.id,
    actorId: execution.actor.id,
    profileId: execution.profile?.id ?? null,
    runId: execution.runId,
  };
}

async function loadCatalog(unitId: AgentDomainUnitId, name: AgentDomainCatalogName) {
  const cacheKey = `${unitId}:${name}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await callWorkspaceInternalJson<RemoteDomainCatalog>({
    callerUnitId: "assistant",
    path: `/api/modules/${unitId}/agent/rpc`,
    targetUnitId: unitId,
    body: { operation: "catalog", catalog: name },
  });
  if (value.schemaVersion !== 1 || value.kind !== "workspace-agent-domain-catalog" || value.unitId !== unitId) {
    throw new Error(`${unitId} returned an invalid Agent catalog`);
  }
  catalogCache.set(cacheKey, { expiresAt: Date.now() + CATALOG_TTL_MS, value });
  return value;
}

async function availableCatalogs(libraryCatalog: AgentDomainCatalogName) {
  const settled = await Promise.allSettled(AGENT_DOMAIN_UNITS.map((unitId) => (
    loadCatalog(unitId, unitId === "library" ? libraryCatalog : "default")
  )));
  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    console.error(`Agent domain ${AGENT_DOMAIN_UNITS[index]} is unavailable`, result.reason);
    return [];
  });
}

function remoteTool(catalogValue: RemoteDomainCatalog, definition: RemoteToolDefinition): AgentTool {
  return {
    ...definition,
    execute: (params, execution) => callWorkspaceInternalJson({
      callerUnitId: "assistant",
      path: `/api/modules/${catalogValue.unitId}/agent/rpc`,
      targetUnitId: catalogValue.unitId,
      body: {
        operation: "tool.execute",
        catalog: catalogValue.catalog,
        toolKey: definition.key,
        params,
        execution: identity(execution),
      },
    }),
  };
}

function remoteExecutor(
  catalogValue: RemoteDomainCatalog,
  actionKey: string,
  definition: RemoteProposalExecutorDefinition,
): ProposalExecutor {
  return {
    ...definition,
    async execute(payload, execution, control) {
      try {
        const response = await callWorkspaceInternalJson<{ result: unknown; sideEffectStarted: boolean }>({
          callerUnitId: "assistant",
          path: `/api/modules/${catalogValue.unitId}/agent/rpc`,
          targetUnitId: catalogValue.unitId,
          body: {
            operation: "proposal.execute",
            actionKey,
            payload,
            execution: identity(execution),
          },
        });
        if (response.sideEffectStarted) control.markExternalDispatchStarted();
        return response.result;
      } catch (error) {
        if (error instanceof WorkspaceInternalRpcError && error.payload?.sideEffectStarted === true) {
          control.markExternalDispatchStarted();
        }
        throw error;
      }
    },
  };
}

export async function loadRemoteAgentTools(options: { libraryCatalog?: AgentDomainCatalogName } = {}) {
  const catalogs = await availableCatalogs(options.libraryCatalog ?? "default");
  return catalogs.flatMap((catalogValue) => (
    catalogValue.tools.map((definition) => remoteTool(catalogValue, definition))
  ));
}

export async function loadRemoteAgentProposalExecutors(): Promise<ProposalExecutors> {
  const catalogs = await availableCatalogs("default");
  return Object.fromEntries(catalogs.flatMap((catalogValue) => (
    Object.entries(catalogValue.proposalExecutors).map(([actionKey, definition]) => (
      [actionKey, remoteExecutor(catalogValue, actionKey, definition)]
    ))
  )));
}
