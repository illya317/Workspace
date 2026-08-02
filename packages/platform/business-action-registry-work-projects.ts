import type { ApiMethod } from "./api-contract-types";

const PERMISSION_ONLY = { eligibility: "permission_only" } as const;
const WORK_PROJECTS = {
  moduleKey: "work",
  resourceKey: "work.projects",
  scopeTypes: ["personal", "department", "committee", "company"],
  originHrefPattern: "/work/project",
} as const;
const WORK_PROJECT_INITIATION = {
  moduleKey: "work",
  resourceKey: "work.projects.initiate",
  originHrefPattern: "/work/project",
} as const;

function route(method: ApiMethod, path: string) {
  return { method, path };
}

export const WORK_PROJECT_BUSINESS_ACTION_REGISTRATIONS = [
  {
    ...WORK_PROJECT_INITIATION,
    eligibility: "workflow_required",
    flowType: "approval",
    separationPolicy: "auto_pass_if_authorized",
    submitPermissionAction: "submit",
    workflowCategoryKey: "collaboration",
    key: "work.projects.project.create",
    label: "提交项目确认",
    writeKind: "submit",
    targetKind: "Project",
    apiRoutes: [
      route("POST", "/api/modules/work/projects"),
      route("GET", "/api/modules/work/projects/submissions/:id"),
      route("POST", "/api/modules/work/projects/submissions/:id/approve"),
      route("POST", "/api/modules/work/projects/submissions/:id/reject"),
      route("POST", "/api/modules/work/projects/submissions/:id/comment"),
    ],
    notes: "项目提交后由所有赋能部门负责人会签；通过前不创建正式 Project。",
  },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.project.update", label: "更新项目", writeKind: "update", targetKind: "Project", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/projects/:id")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.project.delete", label: "删除项目", writeKind: "delete", targetKind: "Project", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/work/projects/:id")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.notificationRule.create", label: "创建项目通知监管规则", writeKind: "create", targetKind: "ProjectNotificationRule", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/projects/:id/notification-rules")], notes: "Work additionally requires project manage access and the explicit settings.notifications.configure grant." },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.notificationRule.update", label: "更新项目通知监管规则", writeKind: "update", targetKind: "ProjectNotificationRule", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/projects/:id/notification-rules/:ruleId")], notes: "Draft revision uses CAS and does not change the published revision pointer." },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.notificationRule.publish", label: "发布项目通知监管规则", writeKind: "revise", targetKind: "ProjectNotificationRule", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/projects/:id/notification-rules/:ruleId/publish")], notes: "Publishing moves the immutable revision pointer after rechecking project, definition, audience, channel and settings authorization." },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.notificationRule.archive", label: "归档项目通知监管规则", writeKind: "archive", targetKind: "ProjectNotificationRule", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/projects/:id/notification-rules/:ruleId/archive")], notes: "Archive is a soft lifecycle transition; historical evaluations and delivery receipts remain immutable." },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.notificationSignal.redrive", label: "重新驱动失败的项目通知信号", writeKind: "revise", targetKind: "ProjectNotificationSignal", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/projects/:id/notification-signals/redrive")], notes: "Redrive is project-scoped, preserves the immutable signal payload, and requires an expected attempt-count CAS token plus a bounded operator reason." },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.member.create", label: "添加项目成员", writeKind: "create", targetKind: "EmployeeProject", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/work/projects/members")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.member.update", label: "更新项目成员", writeKind: "update", targetKind: "EmployeeProject", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/projects/members/:id")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.member.delete", label: "结束项目成员关系", writeKind: "delete", targetKind: "EmployeeProject", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/work/projects/members/:id")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.phase.create", label: "创建项目阶段", writeKind: "create", targetKind: "ProjectPlanPhase", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/work/projects/:id/plan-phases")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.phase.update", label: "更新项目阶段", writeKind: "update", targetKind: "ProjectPlanPhase", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/projects/:id/plan-phases/:phaseId")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.phase.delete", label: "删除项目阶段", writeKind: "delete", targetKind: "ProjectPlanPhase", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/work/projects/:id/plan-phases/:phaseId")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.planGantt.save", label: "保存项目甘特", writeKind: "save", targetKind: "ProjectPlanGantt", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/projects/:id/plan-gantt"), route("PUT", "/api/modules/work/projects/:id/plan-dependencies")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.baseline.create", label: "创建项目计划基线", writeKind: "create", targetKind: "ProjectPlanBaseline", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/work/projects/:id/plan-baselines")] },
  { ...WORK_PROJECTS, ...PERMISSION_ONLY, key: "work.projects.baseline.activate", label: "启用项目计划基线", writeKind: "revise", targetKind: "ProjectPlanBaseline", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/work/projects/:id/plan-baselines/:baselineId/activate")] },
] as const;
