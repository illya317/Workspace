import type { PermissionRegistryActionKey as PermissionActionKey } from "./action-registry";

export const PERMISSION_REVIEW_POLICY_VERSION = 1 as const;

export const HIGH_RISK_PERMISSION_ACTIONS = [
  "delete",
  "archive",
  "revise",
  "reverse",
  "lock",
  "unlock",
  "submit",
  "approve",
  "reject",
  "import",
  "export",
  "apiUse",
  "share",
  "grant",
  "configure",
  "audit",
] as const satisfies readonly PermissionActionKey[];

const HIGH_RISK_ACTION_SET = new Set<PermissionActionKey>(HIGH_RISK_PERMISSION_ACTIONS);
const CRITICAL_ACTION_SET = new Set<PermissionActionKey>([
  "delete",
  "reverse",
  "approve",
  "import",
  "apiUse",
  "share",
  "grant",
  "configure",
]);

export type PermissionReviewSubjectType = "user" | "position" | "department";
export type PermissionReviewSeverity = "critical" | "high" | "warning";
export type PermissionReviewTrigger = "daily" | "permission_mutation" | "manual";

export type PermissionReviewResourceTopology = {
  resourceKey: string;
  parentResourceKey: string | null;
};

export type PermissionReviewGrantReference = {
  subjectType: PermissionReviewSubjectType;
  subjectKey: string;
  resourceKey: string;
  actionKey: PermissionActionKey;
  scopeId: string | null;
};

export type PermissionReviewSeparationRule = {
  key: string;
  resourceKey: string;
  leftActionKey: PermissionActionKey;
  rightActionKey: PermissionActionKey;
  description: string;
};

export type PermissionReviewUserRoleBaseline = {
  username: string;
  positionCodes: string[];
  departmentCodes: string[];
};

export type PermissionReviewSubjectAssignmentBaseline = {
  subjectType: "position" | "department";
  subjectKey: string;
  usernames: string[];
};

export type TenantPermissionReviewPolicy = {
  version: typeof PERMISSION_REVIEW_POLICY_VERSION;
  schedule: {
    dailyAt: string;
    timeZone: string;
  };
  actorUsername: string;
  notificationRecipientUsernames: string[];
  remindOpenAfterHours: number;
  expectedResourceTopology: PermissionReviewResourceTopology[];
  expectedGrants: PermissionReviewGrantReference[];
  expectedDirectGrantUserRoles: PermissionReviewUserRoleBaseline[];
  expectedGrantSubjectAssignments: PermissionReviewSubjectAssignmentBaseline[];
  expectedImplicitGrantManagerPositionCodes: string[];
  separationOfDuties: PermissionReviewSeparationRule[];
};

export type PermissionReviewActualGrant = Omit<PermissionReviewGrantReference, "actionKey"> & {
  actionKey: string;
  subjectLabel: string;
  subjectOperational: boolean;
  resourceEnabled: boolean;
  actionValid: boolean;
  actionSupported: boolean;
};

export type PermissionReviewSeparationCollision = {
  ruleKey: string;
  userKey: string;
  userLabel: string;
  resourceKey: string;
  scopeId: string | null;
  leftActionKey: PermissionActionKey;
  rightActionKey: PermissionActionKey;
};

export type PermissionReviewSnapshot = {
  resourceTopology: PermissionReviewResourceTopology[];
  grants: PermissionReviewActualGrant[];
  directGrantUserRoles: PermissionReviewUserRoleBaseline[];
  grantSubjectAssignments: PermissionReviewSubjectAssignmentBaseline[];
  implicitGrantManagerPositionCodes: string[];
  separationCollisions: PermissionReviewSeparationCollision[];
};

export type PermissionReviewFindingCode =
  | "resource_added_or_unreviewed"
  | "resource_removed"
  | "resource_moved"
  | "unexpected_grant"
  | "expected_grant_missing"
  | "inactive_subject_has_grant"
  | "disabled_resource_has_grant"
  | "invalid_permission_action"
  | "unsupported_permission_action"
  | "direct_grant_user_role_changed"
  | "grant_subject_assignment_changed"
  | "implicit_grant_manager_changed"
  | "separation_of_duties_conflict";

export type PermissionReviewFinding = {
  fingerprint: string;
  code: PermissionReviewFindingCode;
  severity: PermissionReviewSeverity;
  message: string;
  resourceKey: string | null;
  actionKey: string | null;
  subjectType: PermissionReviewSubjectType | null;
  subjectKey: string | null;
  scopeId: string | null;
};

export function isHighRiskPermissionAction(actionKey: PermissionActionKey) {
  return HIGH_RISK_ACTION_SET.has(actionKey);
}

export function shouldRepeatPermissionReviewFinding(
  severity: PermissionReviewSeverity,
  trigger: PermissionReviewTrigger,
  elapsedSinceNotificationHours: number,
  remindOpenAfterHours: number,
) {
  return severity !== "warning"
    && trigger === "daily"
    && elapsedSinceNotificationHours >= remindOpenAfterHours;
}

function grantKey(grant: PermissionReviewGrantReference | PermissionReviewActualGrant) {
  return JSON.stringify([
    grant.subjectType,
    grant.subjectKey,
    grant.resourceKey,
    grant.actionKey,
    grant.scopeId,
  ]);
}

function topologyKey(topology: PermissionReviewResourceTopology) {
  return topology.resourceKey;
}

function finding(
  code: PermissionReviewFindingCode,
  detailKey: string,
  severity: PermissionReviewSeverity,
  message: string,
  detail: Pick<PermissionReviewFinding, "resourceKey" | "actionKey" | "subjectType" | "subjectKey" | "scopeId">,
): PermissionReviewFinding {
  return {
    fingerprint: `${code}:${detailKey}`,
    code,
    severity,
    message,
    ...detail,
  };
}

function grantDetail(grant: PermissionReviewGrantReference | PermissionReviewActualGrant) {
  return {
    resourceKey: grant.resourceKey,
    actionKey: grant.actionKey,
    subjectType: grant.subjectType,
    subjectKey: grant.subjectKey,
    scopeId: grant.scopeId,
  };
}

function subjectTypeLabel(subjectType: PermissionReviewSubjectType) {
  if (subjectType === "user") return "用户";
  if (subjectType === "position") return "岗位";
  return "部门";
}

function scopeLabel(scopeId: string | null) {
  return scopeId ? `（范围 ${scopeId}）` : "";
}

function sortedKey(values: readonly string[]) {
  return [...new Set(values)].sort().join(",");
}

function unexpectedGrantSeverity(actionKey: PermissionActionKey): PermissionReviewSeverity {
  return CRITICAL_ACTION_SET.has(actionKey) ? "critical" : "high";
}

export function evaluatePermissionReview(
  policy: TenantPermissionReviewPolicy,
  snapshot: PermissionReviewSnapshot,
): PermissionReviewFinding[] {
  const findings: PermissionReviewFinding[] = [];
  const expectedTopology = new Map(policy.expectedResourceTopology.map((item) => [topologyKey(item), item]));
  const actualTopology = new Map(snapshot.resourceTopology.map((item) => [topologyKey(item), item]));

  for (const [resourceKey, actual] of actualTopology) {
    const expected = expectedTopology.get(resourceKey);
    if (!expected) {
      findings.push(finding(
        "resource_added_or_unreviewed",
        resourceKey,
        "high",
        `资源 ${resourceKey} 已新增或尚未纳入权限复查基线`,
        { resourceKey, actionKey: null, subjectType: null, subjectKey: null, scopeId: null },
      ));
    } else if (expected.parentResourceKey !== actual.parentResourceKey) {
      findings.push(finding(
        "resource_moved",
        `${resourceKey}:${expected.parentResourceKey ?? "<root>"}->${actual.parentResourceKey ?? "<root>"}`,
        "high",
        `资源 ${resourceKey} 已从 ${expected.parentResourceKey ?? "根级"} 转移到 ${actual.parentResourceKey ?? "根级"}，需复核原授权是否撤销、承接岗位是否补齐`,
        { resourceKey, actionKey: null, subjectType: null, subjectKey: null, scopeId: null },
      ));
    }
  }

  for (const [resourceKey] of expectedTopology) {
    if (actualTopology.has(resourceKey)) continue;
    findings.push(finding(
      "resource_removed",
      resourceKey,
      "high",
      `基线资源 ${resourceKey} 已移除或停用，需确认旧授权已经清理`,
      { resourceKey, actionKey: null, subjectType: null, subjectKey: null, scopeId: null },
    ));
  }

  const expectedGrants = new Map(policy.expectedGrants.map((grant) => [grantKey(grant), grant]));
  const actualGrants = new Map(
    snapshot.grants
      .filter((grant): grant is PermissionReviewActualGrant & { actionKey: PermissionActionKey } => grant.actionValid)
      .map((grant) => [grantKey(grant), grant]),
  );

  for (const [key, actual] of actualGrants) {
    if (expectedGrants.has(key)) continue;
    findings.push(finding(
      "unexpected_grant",
      key,
      unexpectedGrantSeverity(actual.actionKey),
      `${subjectTypeLabel(actual.subjectType)} ${actual.subjectLabel} 出现未经基线核准的 ${actual.resourceKey}.${actual.actionKey}${scopeLabel(actual.scopeId)}`,
      grantDetail(actual),
    ));
  }

  for (const [key, expected] of expectedGrants) {
    if (actualGrants.has(key)) continue;
    findings.push(finding(
      "expected_grant_missing",
      key,
      "high",
      `基线要求的 ${subjectTypeLabel(expected.subjectType)} ${expected.subjectKey} · ${expected.resourceKey}.${expected.actionKey}${scopeLabel(expected.scopeId)} 已缺失`,
      grantDetail(expected),
    ));
  }

  for (const grant of snapshot.grants) {
    const key = grantKey(grant);
    if (!grant.actionValid) {
      findings.push(finding(
        "invalid_permission_action",
        key,
        "critical",
        `${grant.subjectLabel} 持有不存在的权限动作 ${grant.resourceKey}.${grant.actionKey}`,
        grantDetail(grant),
      ));
      continue;
    }
    if (!grant.actionSupported) {
      findings.push(finding(
        "unsupported_permission_action",
        key,
        "critical",
        `${grant.subjectLabel} 持有资源不支持的权限动作 ${grant.resourceKey}.${grant.actionKey}`,
        grantDetail(grant),
      ));
    }
    if (!grant.resourceEnabled) {
      findings.push(finding(
        "disabled_resource_has_grant",
        key,
        "critical",
        `${grant.subjectLabel} 仍持有已移除或停用资源 ${grant.resourceKey} 的授权`,
        grantDetail(grant),
      ));
    }
    if (!grant.subjectOperational) {
      findings.push(finding(
        "inactive_subject_has_grant",
        key,
        grant.actionValid && isHighRiskPermissionAction(grant.actionKey as PermissionActionKey) ? "critical" : "high",
        `停用或失效的${subjectTypeLabel(grant.subjectType)} ${grant.subjectLabel} 仍持有 ${grant.resourceKey}.${grant.actionKey}`,
        grantDetail(grant),
      ));
    }
  }

  const expectedUserRoles = new Map(policy.expectedDirectGrantUserRoles.map((item) => [item.username, item]));
  const actualUserRoles = new Map(snapshot.directGrantUserRoles.map((item) => [item.username, item]));
  for (const [username, expected] of expectedUserRoles) {
    const actual = actualUserRoles.get(username);
    const expectedRoles = `${sortedKey(expected.positionCodes)}|${sortedKey(expected.departmentCodes)}`;
    const actualRoles = actual ? `${sortedKey(actual.positionCodes)}|${sortedKey(actual.departmentCodes)}` : "<inactive>";
    if (expectedRoles === actualRoles) continue;
    findings.push(finding(
      "direct_grant_user_role_changed",
      `${username}:${expectedRoles}->${actualRoles}`,
      "critical",
      `直接授权用户 ${username} 的岗位/部门已变化，必须复核其直接授权是否继续保留`,
      { resourceKey: null, actionKey: null, subjectType: "user", subjectKey: username, scopeId: null },
    ));
  }

  const assignmentKey = (item: PermissionReviewSubjectAssignmentBaseline) => `${item.subjectType}:${item.subjectKey}`;
  const expectedAssignments = new Map(policy.expectedGrantSubjectAssignments.map((item) => [assignmentKey(item), item]));
  const actualAssignments = new Map(snapshot.grantSubjectAssignments.map((item) => [assignmentKey(item), item]));
  for (const [key, expected] of expectedAssignments) {
    const actual = actualAssignments.get(key);
    const expectedUsers = sortedKey(expected.usernames);
    const actualUsers = actual ? sortedKey(actual.usernames) : "";
    if (expectedUsers === actualUsers) continue;
    findings.push(finding(
      "grant_subject_assignment_changed",
      `${key}:${expectedUsers}->${actualUsers}`,
      "critical",
      `持有显式授权的${subjectTypeLabel(expected.subjectType)} ${expected.subjectKey} 任职人员发生变化，必须复核授权承接`,
      { resourceKey: null, actionKey: null, subjectType: expected.subjectType, subjectKey: expected.subjectKey, scopeId: null },
    ));
  }

  const expectedImplicitManagers = new Set(policy.expectedImplicitGrantManagerPositionCodes);
  const actualImplicitManagers = new Set(snapshot.implicitGrantManagerPositionCodes);
  for (const positionCode of new Set([...expectedImplicitManagers, ...actualImplicitManagers])) {
    if (expectedImplicitManagers.has(positionCode) === actualImplicitManagers.has(positionCode)) continue;
    findings.push(finding(
      "implicit_grant_manager_changed",
      positionCode,
      "critical",
      `隐式全资源授权管理员岗位 ${positionCode} 与核准基线不一致`,
      { resourceKey: "settings.admin", actionKey: "grant", subjectType: "position", subjectKey: positionCode, scopeId: null },
    ));
  }

  for (const collision of snapshot.separationCollisions) {
    const key = JSON.stringify([
      collision.ruleKey,
      collision.userKey,
      collision.resourceKey,
      collision.scopeId,
    ]);
    findings.push(finding(
      "separation_of_duties_conflict",
      key,
      "warning",
      `流程职责分离提示：${collision.userLabel} 同时具备 ${collision.resourceKey}.${collision.leftActionKey} 与 ${collision.resourceKey}.${collision.rightActionKey}${scopeLabel(collision.scopeId)}；权限资格可以共存，具体单据必须由流程阻止提交人本人处理`,
      {
        resourceKey: collision.resourceKey,
        actionKey: collision.rightActionKey,
        subjectType: "user",
        subjectKey: collision.userKey,
        scopeId: collision.scopeId,
      },
    ));
  }

  const severityRank: Record<PermissionReviewSeverity, number> = { critical: 0, high: 1, warning: 2 };
  return [...new Map(findings.map((item) => [item.fingerprint, item])).values()]
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
      || left.fingerprint.localeCompare(right.fingerprint));
}
