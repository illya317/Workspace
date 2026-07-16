import {
  PERMISSION_ACTION_KEYS,
  type PermissionActionKey,
} from "@workspace/platform/permission-actions";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export type AgentPermissionSubjectType = "user" | "position" | "department";

export type AgentPermissionGrantChange = {
  subjectType: AgentPermissionSubjectType;
  subjectId: number;
  resourceKey: string;
  actionKey: PermissionActionKey;
  value: boolean;
};

export type AgentActionCeilingUpdateCommand = {
  editorUserId: number;
  actionKeys: PermissionActionKey[];
};

export type AgentPermissionGrantBatchCommand = {
  actorUserId: number;
  changes: AgentPermissionGrantChange[];
};

function validActorId(userId: number, field: string) {
  return Number.isInteger(userId) && userId > 0
    ? null
    : failCommand("操作人员无效", 400, field);
}

export function validateAgentActionCeilingUpdate(input: {
  editorUserId: number;
  actionKeys: readonly PermissionActionKey[];
}): DomainValidationResult<AgentActionCeilingUpdateCommand> {
  const actorIssue = validActorId(input.editorUserId, "editorUserId");
  if (actorIssue) return actorIssue;
  const selected = new Set(input.actionKeys);
  return okCommand({
    editorUserId: input.editorUserId,
    actionKeys: PERMISSION_ACTION_KEYS.filter((actionKey) => selected.has(actionKey)),
  });
}

export function validateAgentPermissionGrantBatch(
  input: { actorUserId: number; changes: readonly AgentPermissionGrantChange[] },
  context: { registeredAgentResourceKeys: readonly string[] },
): DomainValidationResult<AgentPermissionGrantBatchCommand> {
  const actorIssue = validActorId(input.actorUserId, "actorUserId");
  if (actorIssue) return actorIssue;
  if (input.changes.length === 0) return failCommand("至少需要一项授权变更", 400, "changes");
  if (input.changes.length > 100) return failCommand("单次授权变更不能超过 100 项", 400, "changes");

  const registered = new Set(context.registeredAgentResourceKeys);
  const seen = new Set<string>();
  const changes: AgentPermissionGrantChange[] = [];
  for (const [index, change] of input.changes.entries()) {
    const resourceKey = change.resourceKey.trim();
    if (!registered.has(resourceKey)) {
      return failCommand("只能维护已注册的 Agent 能力资源", 400, `changes.${index}.resourceKey`);
    }
    const identity = `${change.subjectType}:${change.subjectId}:${resourceKey}:${change.actionKey}`;
    if (seen.has(identity)) {
      return failCommand("同一授权动作不能在一个批次中重复", 400, `changes.${index}`);
    }
    seen.add(identity);
    changes.push({ ...change, resourceKey });
  }

  return okCommand({ actorUserId: input.actorUserId, changes });
}
