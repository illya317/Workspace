import "server-only";

import {
  evaluatePermissionReview,
  shouldRepeatPermissionReviewFinding,
  type PermissionReviewActualGrant,
  type PermissionReviewFinding,
  type PermissionReviewGrantReference,
  type PermissionReviewResourceTopology,
  type PermissionReviewSeparationCollision,
  type PermissionReviewSnapshot,
  type PermissionReviewTrigger,
  type TenantPermissionReviewPolicy,
} from "@workspace/platform/permission-review-policy";
import { activeWorkspacePackages } from "@workspace/platform/modules";
import { isResourceEnabled } from "@workspace/platform/effective-module-registry";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { permissionGrantContributesToAction } from "@workspace/platform/permission-action-grantability";
import { isPermissionActionSupported } from "@workspace/platform/permission-resource-policy";
import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { workspaceBusinessDate, workspaceBusinessDayStart } from "./business-date";
import { sendNotification } from "./notifications";
import { Prisma, prisma } from "./prisma";
import { currentEmploymentDateWhere } from "./relation-registry";
import { getTenantPermissionReview } from "./tenant-config";
import { getImplicitGrantManagerPositionIds } from "./rbac/implicit-admins";

const PERMISSION_REVIEW_STATE_KEY = "security.permissionReview.state.v1";
const PERMISSION_REVIEW_LOCK_KEY = "workspace:security:permission-review:v1";

type PermissionDatabaseClient = Prisma.TransactionClient | typeof prisma;

type PermissionReviewStateFinding = {
  firstSeenAt: string;
  lastSeenAt: string;
  lastNotifiedAt: string | null;
};

type PermissionReviewState = {
  version: 1;
  lastRunAt: string | null;
  lastDailyRunAt: string | null;
  openFindings: Record<string, PermissionReviewStateFinding>;
};

export type PermissionReviewRunResult = {
  trigger: PermissionReviewTrigger;
  checkedAt: string;
  findingCount: number;
  notifiedFindingCount: number;
  findings: PermissionReviewFinding[];
};

export async function inspectPermissionReview(): Promise<PermissionReviewFinding[]> {
  const policy = getTenantPermissionReview();
  const snapshot = await buildPermissionReviewSnapshot(prisma, policy);
  return evaluatePermissionReview(policy, snapshot);
}

function emptyState(): PermissionReviewState {
  return { version: 1, lastRunAt: null, lastDailyRunAt: null, openFindings: {} };
}

function parseState(value: string | null | undefined): PermissionReviewState {
  if (!value) return emptyState();
  try {
    const parsed = JSON.parse(value) as Partial<PermissionReviewState>;
    if (parsed.version !== 1 || !parsed.openFindings || typeof parsed.openFindings !== "object") return emptyState();
    return {
      version: 1,
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : null,
      lastDailyRunAt: typeof parsed.lastDailyRunAt === "string" ? parsed.lastDailyRunAt : null,
      openFindings: parsed.openFindings,
    };
  } catch {
    return emptyState();
  }
}

export function listPermissionReviewResourceTopology(): PermissionReviewResourceTopology[] {
  const topology: PermissionReviewResourceTopology[] = [];
  for (const pkg of activeWorkspacePackages) {
    const moduleDef = pkg.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    topology.push({ resourceKey: moduleDef.resourceKey, parentResourceKey: null });
    for (const child of moduleDef.children ?? []) {
      topology.push({ resourceKey: child.resourceKey, parentResourceKey: moduleDef.resourceKey });
    }
  }
  return [...new Map(topology.map((item) => [item.resourceKey, item])).values()]
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
}

function positionOperational(position: { isArchived: boolean; endDate: Date | null }, activeDateTimeFloor: Date) {
  return !position.isArchived && (!position.endDate || position.endDate >= activeDateTimeFloor);
}

function departmentOperational(department: { isArchived: boolean; endDate: Date | null }, activeDateTimeFloor: Date) {
  return !department.isArchived && (!department.endDate || department.endDate >= activeDateTimeFloor);
}

function userOperational(user: {
  canLogin: boolean;
  employees: Array<{ employments: Array<{ id: number }> }>;
  agentProfile: null | { status: string; runtimeBindings: Array<{ status: string }> };
}) {
  const activeEmployee = user.canLogin
    && user.employees.some((employee) => employee.employments.length > 0);
  const activeAgent = user.agentProfile?.status === "active"
    && user.agentProfile.runtimeBindings.some((binding) => binding.status === "active");
  return Boolean(activeEmployee || activeAgent);
}

function grantRuntimeState(resourceKey: string, actionKey: string) {
  const actionValid = isPermissionActionKey(actionKey);
  return {
    resourceEnabled: RESOURCE_KEYS.includes(resourceKey) && isResourceEnabled(resourceKey),
    actionValid,
    actionSupported: actionValid && isPermissionActionSupported(resourceKey, actionKey),
  };
}

async function listActualGrants(client: PermissionDatabaseClient): Promise<PermissionReviewActualGrant[]> {
  const [userGrants, positionGrants, departmentGrants] = await Promise.all([
    client.userResourceActionGrant.findMany({
      select: {
        actionKey: true,
        scopeId: true,
        resource: { select: { key: true } },
        user: {
          select: {
            username: true,
            canLogin: true,
            employees: { select: { name: true, employments: { where: currentEmploymentDateWhere(), select: { id: true } } } },
            agentProfile: { select: { status: true, displayName: true, runtimeBindings: { select: { status: true } } } },
          },
        },
      },
    }),
    client.positionResourceActionGrant.findMany({
      select: {
        actionKey: true,
        scopeId: true,
        resource: { select: { key: true } },
        position: { select: { code: true, name: true, isArchived: true, endDate: true } },
      },
    }),
    client.departmentResourceActionGrant.findMany({
      select: {
        actionKey: true,
        scopeId: true,
        resource: { select: { key: true } },
        department: { select: { code: true, name: true, isArchived: true, endDate: true } },
      },
    }),
  ]);
  const activeDateTimeFloor = workspaceBusinessDayStart(new Date());
  return [
    ...userGrants.map((grant): PermissionReviewActualGrant => ({
      subjectType: "user",
      subjectKey: grant.user.username,
      subjectLabel: grant.user.employees[0]?.name ?? grant.user.agentProfile?.displayName ?? grant.user.username,
      subjectOperational: userOperational(grant.user),
      resourceKey: grant.resource.key,
      actionKey: grant.actionKey,
      scopeId: grant.scopeId,
      ...grantRuntimeState(grant.resource.key, grant.actionKey),
    })),
    ...positionGrants.map((grant): PermissionReviewActualGrant => ({
      subjectType: "position",
      subjectKey: grant.position.code,
      subjectLabel: `${grant.position.name}（${grant.position.code}）`,
      subjectOperational: positionOperational(grant.position, activeDateTimeFloor),
      resourceKey: grant.resource.key,
      actionKey: grant.actionKey,
      scopeId: grant.scopeId,
      ...grantRuntimeState(grant.resource.key, grant.actionKey),
    })),
    ...departmentGrants.map((grant): PermissionReviewActualGrant => ({
      subjectType: "department",
      subjectKey: grant.department.code,
      subjectLabel: `${grant.department.name}（${grant.department.code}）`,
      subjectOperational: departmentOperational(grant.department, activeDateTimeFloor),
      resourceKey: grant.resource.key,
      actionKey: grant.actionKey,
      scopeId: grant.scopeId,
      ...grantRuntimeState(grant.resource.key, grant.actionKey),
    })),
  ];
}

type ActiveUserAssignment = {
  userKey: string;
  userLabel: string;
  positionKeys: Set<string>;
  departmentKeys: Set<string>;
};

async function listActiveUserAssignments(client: PermissionDatabaseClient): Promise<ActiveUserAssignment[]> {
  const now = new Date();
  const today = workspaceBusinessDate(now);
  const activeDateTimeFloor = workspaceBusinessDayStart(now);
  const users = await client.user.findMany({
    where: {
      OR: [
        { canLogin: true },
        { agentProfile: { is: { status: "active", runtimeBindings: { some: { status: "active" } } } } },
      ],
    },
    select: {
      username: true,
      canLogin: true,
      agentProfile: { select: { status: true, runtimeBindings: { select: { status: true } } } },
      employees: {
        where: { employments: { some: currentEmploymentDateWhere() } },
        select: {
          name: true,
          employments: { where: currentEmploymentDateWhere(), select: { id: true } },
          positions: {
            where: {
              AND: [
                { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: today } }] },
                { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }] },
                {
                  OR: [
                    { positionId: null },
                    { position: { isArchived: false, OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }] } },
                  ],
                },
                {
                  OR: [
                    { departmentId: null },
                    { department: { isArchived: false, OR: [{ endDate: null }, { endDate: { gte: activeDateTimeFloor } }] } },
                  ],
                },
              ],
            },
            select: {
              position: { select: { code: true } },
              department: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  return users
    .filter((user) => userOperational(user))
    .map((user) => ({
      userKey: user.username,
      userLabel: user.employees[0]?.name ?? user.username,
      positionKeys: new Set(user.employees.flatMap((employee) => employee.positions.map((item) => item.position?.code).filter(Boolean) as string[])),
      departmentKeys: new Set(user.employees.flatMap((employee) => employee.positions.map((item) => item.department?.code).filter(Boolean) as string[])),
    }));
}

function grantRoleBaselines(
  grants: PermissionReviewActualGrant[],
  users: ActiveUserAssignment[],
): Pick<PermissionReviewSnapshot, "directGrantUserRoles" | "grantSubjectAssignments"> {
  const validGrants = grants.filter((grant) => grant.actionValid);
  const directUserKeys = new Set(
    validGrants.filter((grant) => grant.subjectType === "user").map((grant) => grant.subjectKey),
  );
  const directGrantUserRoles = users
    .filter((user) => directUserKeys.has(user.userKey))
    .map((user) => ({
      username: user.userKey,
      positionCodes: [...user.positionKeys].sort(),
      departmentCodes: [...user.departmentKeys].sort(),
    }))
    .sort((left, right) => left.username.localeCompare(right.username));

  const subjectGrants = new Map<string, PermissionReviewActualGrant>();
  for (const grant of validGrants) {
    if (grant.subjectType === "user") continue;
    subjectGrants.set(`${grant.subjectType}:${grant.subjectKey}`, grant);
  }
  const grantSubjectAssignments = [...subjectGrants.values()].map((grant) => ({
    subjectType: grant.subjectType as "position" | "department",
    subjectKey: grant.subjectKey,
    usernames: users
      .filter((user) => grantAppliesToUser(grant, user))
      .map((user) => user.userKey)
      .sort(),
  })).sort((left, right) => `${left.subjectType}:${left.subjectKey}`.localeCompare(`${right.subjectType}:${right.subjectKey}`));
  return { directGrantUserRoles, grantSubjectAssignments };
}

function grantAppliesToUser(grant: PermissionReviewActualGrant, user: ActiveUserAssignment) {
  if (grant.subjectType === "user") return grant.subjectKey === user.userKey;
  if (grant.subjectType === "position") return user.positionKeys.has(grant.subjectKey);
  return user.departmentKeys.has(grant.subjectKey);
}

function scopeOverlap(left: string | null, right: string | null) {
  return left === right || left === null || right === null;
}

function collisionScope(left: string | null, right: string | null) {
  return left === right ? left : left ?? right;
}

function grantContributes(grant: PermissionReviewActualGrant, resourceKey: string, actionKey: PermissionActionKey) {
  return grant.resourceKey === resourceKey
    && grant.actionValid
    && permissionGrantContributesToAction(resourceKey, grant.actionKey as PermissionActionKey, actionKey);
}

function buildSeparationCollisions(
  policy: TenantPermissionReviewPolicy,
  grants: PermissionReviewActualGrant[],
  users: ActiveUserAssignment[],
): PermissionReviewSeparationCollision[] {
  const collisions: PermissionReviewSeparationCollision[] = [];
  for (const rule of policy.separationOfDuties) {
    for (const user of users) {
      const applicable = grants.filter((grant) => grant.subjectOperational && grantAppliesToUser(grant, user));
      const leftGrants = applicable.filter((grant) => grantContributes(grant, rule.resourceKey, rule.leftActionKey));
      const rightGrants = applicable.filter((grant) => grantContributes(grant, rule.resourceKey, rule.rightActionKey));
      for (const left of leftGrants) {
        for (const right of rightGrants) {
          if (!scopeOverlap(left.scopeId, right.scopeId)) continue;
          collisions.push({
            ruleKey: rule.key,
            userKey: user.userKey,
            userLabel: user.userLabel,
            resourceKey: rule.resourceKey,
            scopeId: collisionScope(left.scopeId, right.scopeId),
            leftActionKey: rule.leftActionKey,
            rightActionKey: rule.rightActionKey,
          });
        }
      }
    }
  }
  return collisions;
}

async function buildPermissionReviewSnapshot(
  client: PermissionDatabaseClient,
  policy: TenantPermissionReviewPolicy,
): Promise<PermissionReviewSnapshot> {
  const [grants, users, implicitManagerPositionIds] = await Promise.all([
    listActualGrants(client),
    listActiveUserAssignments(client),
    getImplicitGrantManagerPositionIds(client),
  ]);
  const implicitManagers = implicitManagerPositionIds.length
    ? await client.position.findMany({
        where: { id: { in: implicitManagerPositionIds } },
        select: { code: true },
      })
    : [];
  return {
    resourceTopology: listPermissionReviewResourceTopology(),
    grants,
    ...grantRoleBaselines(grants, users),
    implicitGrantManagerPositionCodes: [...new Set(implicitManagers.map((position) => position.code))].sort(),
    separationCollisions: buildSeparationCollisions(policy, grants, users),
  };
}

function elapsedHours(from: string | null, to: Date) {
  if (!from) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(from);
  return Number.isFinite(timestamp) ? (to.getTime() - timestamp) / 3_600_000 : Number.POSITIVE_INFINITY;
}

function findingsToNotify(
  trigger: PermissionReviewTrigger,
  findings: PermissionReviewFinding[],
  state: PermissionReviewState,
  now: Date,
  remindOpenAfterHours: number,
) {
  return findings.filter((item) => {
    const previous = state.openFindings[item.fingerprint];
    if (!previous) return true;
    return shouldRepeatPermissionReviewFinding(
      item.severity,
      trigger,
      elapsedHours(previous.lastNotifiedAt, now),
      remindOpenAfterHours,
    );
  });
}

function nextState(
  trigger: PermissionReviewTrigger,
  findings: PermissionReviewFinding[],
  notifiedFingerprints: Set<string>,
  previous: PermissionReviewState,
  now: Date,
): PermissionReviewState {
  const checkedAt = now.toISOString();
  const openFindings = Object.fromEntries(findings.map((item) => {
    const old = previous.openFindings[item.fingerprint];
    return [item.fingerprint, {
      firstSeenAt: old?.firstSeenAt ?? checkedAt,
      lastSeenAt: checkedAt,
      lastNotifiedAt: notifiedFingerprints.has(item.fingerprint) ? checkedAt : old?.lastNotifiedAt ?? null,
    } satisfies PermissionReviewStateFinding];
  }));
  return {
    version: 1,
    lastRunAt: checkedAt,
    lastDailyRunAt: trigger === "daily" ? checkedAt : previous.lastDailyRunAt,
    openFindings,
  };
}

async function resolveNotificationUsers(client: PermissionDatabaseClient, policy: TenantPermissionReviewPolicy) {
  const users = await client.user.findMany({
    where: { username: { in: [...new Set([policy.actorUsername, ...policy.notificationRecipientUsernames])] } },
    select: { id: true, username: true, canLogin: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user]));
  const actor = byUsername.get(policy.actorUsername);
  if (!actor) throw new Error(`Permission review actor is missing: ${policy.actorUsername}`);
  const missingRecipients = policy.notificationRecipientUsernames.filter((username) => !byUsername.get(username)?.canLogin);
  if (missingRecipients.length > 0) {
    throw new Error(`Permission review recipients are missing or disabled: ${missingRecipients.join(", ")}`);
  }
  return {
    actorUserId: actor.id,
    recipients: policy.notificationRecipientUsernames.map((username) => byUsername.get(username)!),
  };
}

export async function runPermissionReview(
  trigger: PermissionReviewTrigger,
  now = new Date(),
): Promise<PermissionReviewRunResult> {
  const policy = getTenantPermissionReview();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${PERMISSION_REVIEW_LOCK_KEY}, 0))::text AS lock_result`,
    );
    const snapshot = await buildPermissionReviewSnapshot(tx, policy);
    const findings = evaluatePermissionReview(policy, snapshot);
    const storedState = await tx.systemConfig.findUnique({ where: { key: PERMISSION_REVIEW_STATE_KEY } });
    const state = parseState(storedState?.value);
    const notifying = findingsToNotify(trigger, findings, state, now, policy.remindOpenAfterHours);
    const notifiedFingerprints = new Set(notifying.map((item) => item.fingerprint));

    if (notifying.length > 0) {
      const notificationUsers = await resolveNotificationUsers(tx, policy);
      const groups = [
        { findings: notifying.filter((item) => item.severity !== "warning"), advisory: false },
        { findings: notifying.filter((item) => item.severity === "warning"), advisory: true },
      ].filter((group) => group.findings.length > 0);
      for (const recipient of notificationUsers.recipients) {
        for (const group of groups) {
          const criticalCount = group.findings.filter((item) => item.severity === "critical").length;
          await sendNotification({
            recipientUserId: recipient.id,
            actorUserId: notificationUsers.actorUserId,
            type: "security.permissionReview.alert",
            payload: {
              trigger,
              checkedAt: now.toISOString(),
              findingCount: group.findings.length,
              criticalCount,
              alertCount: group.advisory ? 0 : group.findings.length,
              advisoryCount: group.advisory ? group.findings.length : 0,
              findings: group.findings.map((item) => ({
                code: item.code,
                severity: item.severity,
                message: item.message,
                fingerprint: item.fingerprint,
              })),
            },
            isImportant: !group.advisory,
            isStrongReminder: !group.advisory,
            requiresAcknowledgement: !group.advisory,
          }, tx);
        }
      }
    }

    await tx.systemConfig.upsert({
      where: { key: PERMISSION_REVIEW_STATE_KEY },
      create: {
        key: PERMISSION_REVIEW_STATE_KEY,
        value: JSON.stringify(nextState(trigger, findings, notifiedFingerprints, state, now)),
      },
      update: {
        value: JSON.stringify(nextState(trigger, findings, notifiedFingerprints, state, now)),
      },
    });
    return {
      trigger,
      checkedAt: now.toISOString(),
      findingCount: findings.length,
      notifiedFindingCount: notifying.length,
      findings,
    } satisfies PermissionReviewRunResult;
  }, { maxWait: 5_000, timeout: 30_000 });

  console.log(JSON.stringify({
    event: "permission_review_completed",
    trigger: result.trigger,
    checkedAt: result.checkedAt,
    findingCount: result.findingCount,
    notifiedFindingCount: result.notifiedFindingCount,
    criticalCount: result.findings.filter((item) => item.severity === "critical").length,
  }));
  return result;
}

export async function runPermissionReviewAfterGrantMutation(changes: ReadonlyArray<{
  subjectType: "user" | "position" | "department";
  subjectId: number;
  resourceKey: string;
  actionKey: PermissionActionKey;
  scopeId?: string | null;
}>) {
  if (process.env.NODE_ENV !== "production" || changes.length === 0) return;
  try {
    await runPermissionReview("permission_mutation");
  } catch (error) {
    console.error(JSON.stringify({
      event: "permission_review_immediate_failed",
      changedPermissions: changes.map((change) => ({
        subjectType: change.subjectType,
        subjectId: change.subjectId,
        resourceKey: change.resourceKey,
        actionKey: change.actionKey,
        scopeId: change.scopeId,
      })),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

export function grantReferences(grants: PermissionReviewActualGrant[]): PermissionReviewGrantReference[] {
  return grants
    .filter((grant) => grant.actionValid)
    .map((grant) => ({
      subjectType: grant.subjectType,
      subjectKey: grant.subjectKey,
      resourceKey: grant.resourceKey,
      actionKey: grant.actionKey as PermissionActionKey,
      scopeId: grant.scopeId,
    }));
}
