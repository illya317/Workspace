import "server-only";

import { agentPolicyAllowsActions } from "@workspace/platform/agent-permission-policy";
import type { ApiContract } from "@workspace/platform/api-registry";
import { getSystemConfig } from "@workspace/platform/server/system-config";
import type { SessionUser } from "@workspace/platform/types";

import type { AuthPayload } from "../auth-token";
import { getSessionUserFromAuthPayload } from "../auth/session";
import { evaluatePermissionAction } from "../rbac/action-grants";
import { canEnterResource } from "../rbac/resource-entry";
import type { AgentExecutionContext } from "./execution";
import { resolveStoredAgentExecutionContext } from "./execution-context";

async function identityCanUseContract(identity: SessionUser, contract: ApiContract) {
  const authorization = contract.authorization;
  if (!authorization.resourceKey) return false;
  if (authorization.runtimeEnforcement === "serviceDelegated") {
    return canEnterResource(identity.id, authorization.resourceKey);
  }
  for (const action of authorization.requiredActions) {
    const allowed = action === "entry" && !authorization.scopeId
      ? await canEnterResource(identity.id, authorization.resourceKey)
      : await evaluatePermissionAction(identity.id, authorization.resourceKey, action, {
          scopeId: authorization.scopeId ?? undefined,
          projection: authorization.projection,
        });
    if (!allowed) return false;
  }
  return true;
}

export async function canAgentExecutionUseBusinessApi(
  execution: AgentExecutionContext,
  contract: ApiContract,
) {
  if (
    contract.apiKind !== "business"
    || contract.access !== "protected"
    || !contract.pathPrefix.startsWith("/api/modules/")
  ) return false;
  const { agentAllowedActions } = await getSystemConfig();
  if (!agentPolicyAllowsActions(contract.requiredActions, agentAllowedActions)) return false;
  if (execution.profile && contract.runtimeEnforcement === "serviceDelegated") {
    // The normal API can recheck one concrete object identity. Until the
    // owning contract supports a dual-subject guard, a selected virtual actor
    // must fail closed instead of borrowing the requester's object scope.
    return false;
  }
  const identities = execution.requester.id === execution.actor.id
    ? [execution.requester]
    : [execution.requester, execution.actor];
  const checks = await Promise.all(identities.map((identity) => identityCanUseContract(identity, contract)));
  return checks.every(Boolean);
}

export async function authorizeAgentApiDelegation(
  payload: AuthPayload,
  contract: ApiContract,
) {
  const delegation = payload.agentDelegation;
  if (!delegation || payload.userId !== delegation.requesterId) return false;
  const requester = await getSessionUserFromAuthPayload(payload);
  if (!requester) return false;
  try {
    const execution = await resolveStoredAgentExecutionContext(
      requester,
      delegation.actorId,
      delegation.profileId,
    );
    return canAgentExecutionUseBusinessApi(
      delegation.runId ? { ...execution, runId: delegation.runId } : execution,
      contract,
    );
  } catch {
    return false;
  }
}
