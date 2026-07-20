import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let entryAllowed = true;
let submitAllowed = false;
let activeEmployee = true;
const permissionCalls: Array<{ resourceKey: string; actionKey: string }> = [];

const okCommand = <T>(data: T) => ({ ok: true as const, data });
const failCommand = (message: string, status = 400, field?: string) => ({
  ok: false as const,
  issue: { message, status, field },
});

mockModule("@workspace/platform/server/auth/admin", {
  namedExports: { isSuperAdmin: async () => false },
});
mockModule("@workspace/platform/server/rbac/action-grants", {
  namedExports: {
    evaluatePermissionAction: async (_userId: number, resourceKey: string, actionKey: string) => {
      permissionCalls.push({ resourceKey, actionKey });
      return actionKey === "submit" ? submitAllowed && entryAllowed : false;
    },
  },
});
mockModule("@workspace/platform/server/rbac/resource-entry", {
  namedExports: { canEnterResource: async () => entryAllowed },
});
mockModule("@workspace/platform/permission-actions", {
  namedExports: { actionImplies: () => false },
});
mockModule("@workspace/platform/permission-natural-space-actions", {
  namedExports: { getNaturalSpaceActionProfileActionKeys: () => [] },
});
mockModule("@workspace/platform/permission-resource-policy", {
  namedExports: { getSpaceChildResourceKeyForTargetType: () => null },
});
mockModule("@workspace/platform/server/business-space-permissions", {
  namedExports: {
    businessSpaceScopeId: () => null,
    getCompanyNaturalSpaceActionProfile: () => ({}),
    getDepartmentNaturalSpaceActionProfile: () => ({}),
    isDepartmentResponsiblePositionUser: async () => false,
    listDepartmentIdsManagedByUserPosition: async () => [],
    getOperatingCommitteeNaturalSpaceActionProfile: () => ({}),
  },
});
mockModule("@workspace/platform/server/business-space-natural-users", {
  namedExports: {
    isActiveEmployeeUser: async () => activeEmployee,
    listDepartmentResponsibleUserIds: async () => [],
  },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: { prisma: {} },
});
mockModule("../constants/field-options", {
  namedExports: { PROJECT_ROLES: [] },
});
mockModule("./project-space-action-access", {
  namedExports: {
    canViewCommitteeProjectSpace: async () => false,
    canViewCompanyProjectSpace: async () => false,
    getWorkProjectSpaceGrantPermissionsForProject: async () => null,
    listVisibleProjectDepartmentSpaceIds: async () => [],
  },
});
mockModule("@workspace/platform/server/business-action-executor", {
  namedExports: {
    defineBusinessActionCommandAdapter: (value: unknown) => value,
    executeApprovedBusinessActionCommand: async () => ({ ok: true, data: {} }),
    executeBusinessActionCommand: async () => ({ ok: true, data: { executionMode: "workflow", request: {} } }),
    resolveBusinessActionRuntime: (value: unknown) => value,
  },
});
mockModule("@workspace/platform/server/approval-lifecycle", {
  namedExports: {
    bindApprovalLifecycle: () => ({
      approve: async () => ({}),
      reject: async () => ({}),
      comment: async () => ({}),
    }),
  },
});
mockModule("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: <T>(data: T) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: {
    failCommand,
    mapValidationToServiceResult: (value: unknown) => value,
    okCommand,
  },
});
mockModule("@workspace/platform/server/approvals/serialization", {
  namedExports: { requestInclude: {}, toDto: () => ({}), toRecord: () => ({}) },
});
mockModule("./domain/project-validation", {
  namedExports: { buildProjectCreateCommand: async () => okCommand({ enablingDepartmentIds: [] }) },
});
mockModule("./projects", {
  namedExports: {
    commitProjectCreateCommand: async () => ({ ok: true, data: {} }),
    deleteProject: async () => ({}),
    listProjectGantt: async () => ({}),
    listProjects: async () => ({}),
    updateProjectField: async () => ({}),
  },
});
mockModule("./project-approval-handlers", {
  namedExports: { remainingProjectConfirmationHandlers: (userIds: number[]) => userIds },
});
mockModule("@workspace/platform/server/auth", {
  namedExports: { authorize: async () => true, canEnterResource: async () => true },
});
mockModule("@workspace/platform/server/relation-registry", {
  namedExports: { normalizeLifecycleScope: () => null, searchFkOptions: async () => [] },
});
mockModule("./task-reports", {
  namedExports: { getWorkReportDraft: async () => ({}), listWorkReportCollection: async () => [] },
});
mockModule("./task-spaces", {
  namedExports: { listWorkTaskSpaces: async () => [] },
});
mockModule("./work-period-collection", {
  namedExports: { listWorkPeriodCollection: async () => [] },
});
mockModule("./fk-registry", {
  namedExports: { WORK_FK_REGISTRY: { require: () => ({}) } },
});
mockModule("./work-assigned-items", {
  namedExports: {
    listAssignedDepartmentWorkItems: async () => [],
    listAssignedDepartmentWorkPlanGroups: async () => [],
    listAssignedPersonalCollaborationWorkItems: async () => [],
    listAssignedPersonalCollaborationWorkPlanGroups: async () => [],
  },
});
mockModule("./works", {
  namedExports: {
    createWorkItem: async () => ({}),
    deleteWorkItem: async () => ({}),
    getWorkItemTargetMetadata: async () => ({}),
    getWorkItems: async () => [],
    updateWorkItem: async () => ({}),
  },
});
mockModule("./domain/work-participant-normalization", {
  namedExports: { parseParticipants: () => [] },
});

const { canSubmitWorkProjectAction } = await import("./access");
const { resolveWorkProjectCreateActionRuntime } = await import("./project-action-runtime");
const { workProjectApprovalAdapter } = await import("./project-approvals");
const { buildCreateProjectRouteCommand } = await import("./work-task-route-command");

type RuntimeProjection = { actor: { canStartWorkflow: boolean }; resourceKey: string };
type ResolveAccess = (input: { actorUserId: number; action: "createDraft" }) => Promise<boolean>;

function reset(input: { entry: boolean; submit: boolean; active: boolean }) {
  entryAllowed = input.entry;
  submitAllowed = input.submit;
  activeEmployee = input.active;
  permissionCalls.length = 0;
}

async function projectInitiationSurfaces() {
  const route = await buildCreateProjectRouteCommand({ userId: 7, body: {} as never });
  const runtime = await resolveWorkProjectCreateActionRuntime(7) as unknown as RuntimeProjection;
  const adapter = await (workProjectApprovalAdapter.resolveAccess as unknown as ResolveAccess)({
    actorUserId: 7,
    action: "createDraft",
  });
  return { route, runtime, adapter };
}

test("entry-only users cannot initiate a Work project", async () => {
  reset({ entry: true, submit: false, active: true });

  assert.equal(await canSubmitWorkProjectAction(7), false);
  const surfaces = await projectInitiationSurfaces();

  assert.equal(surfaces.route.ok, false);
  if (!surfaces.route.ok) assert.equal(surfaces.route.issue.status, 403);
  assert.equal(surfaces.runtime.actor.canStartWorkflow, false);
  assert.equal(surfaces.adapter, false);
  assert.equal(permissionCalls.every((call) => (
    call.resourceKey === "work.projects.initiate" && call.actionKey === "submit"
  )), true);
});

test("active employees with submit permission can initiate through every Work project surface", async () => {
  reset({ entry: true, submit: true, active: true });

  assert.equal(await canSubmitWorkProjectAction(7), true);
  const surfaces = await projectInitiationSurfaces();

  assert.equal(surfaces.route.ok, true);
  assert.equal(surfaces.runtime.actor.canStartWorkflow, true);
  assert.equal(surfaces.runtime.resourceKey, "work.projects.initiate");
  assert.equal(surfaces.adapter, true);
  assert.equal(permissionCalls.every((call) => (
    call.resourceKey === "work.projects.initiate" && call.actionKey === "submit"
  )), true);
});

test("project initiation capability still requires its work.projects owner entry", async () => {
  reset({ entry: false, submit: true, active: true });
  assert.equal(await canSubmitWorkProjectAction(7), false);
});

test("submit permission does not bypass active-employee eligibility", async () => {
  reset({ entry: true, submit: true, active: false });
  assert.equal(await canSubmitWorkProjectAction(7), false);
});
