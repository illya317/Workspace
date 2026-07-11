import type { ApiMethod } from "./api-contract-types";

function route(method: ApiMethod, path: string, notes?: string) {
  return notes ? { method, path, notes } : { method, path };
}

export const WORK_GOAL_ACTION_DESCRIPTORS = [
  {
    key: "work.tasks.goal.department.objective.submit",
    label: "部门期初目标提交",
    writeKind: "submit",
    targetKind: "WorkGoalInitialSnapshot",
    settingsSortOrder: 101,
    apiRoutes: [
      route("POST", "/api/modules/work/tasks/submissions"),
      route("POST", "/api/modules/work/tasks/submissions/:id/submit"),
    ],
    notes: "部门、公司、运营委员会等组织期初目标提交流程，支持目标计划快照和周期期初目标表。",
  },
  {
    key: "work.tasks.goal.personal.objective.submit",
    label: "个人期初目标提交",
    writeKind: "submit",
    targetKind: "WorkGoalInitialSnapshot",
    settingsSortOrder: 102,
    apiRoutes: [
      route("POST", "/api/modules/work/tasks/submissions"),
      route("POST", "/api/modules/work/tasks/submissions/:id/submit"),
    ],
    notes: "个人期初目标提交流程，支持个人目标计划快照和周期期初目标表；审批归属仍可解析到其管控部门空间。",
  },
  {
    key: "work.tasks.goal.department.report.submit",
    label: "部门考核结果提交",
    writeKind: "submit",
    targetKind: "WorkReport",
    settingsSortOrder: 301,
    apiRoutes: [
      route("PUT", "/api/modules/work/tasks/reports", "汇报审批前的本地草稿保存"),
      route("POST", "/api/modules/work/tasks/submissions"),
      route("POST", "/api/modules/work/tasks/submissions/:id/submit"),
    ],
    notes: "组织目标的考核结果提交流程。",
  },
  {
    key: "work.tasks.goal.personal.report.submit",
    label: "个人考核结果提交",
    writeKind: "submit",
    targetKind: "WorkReport",
    settingsSortOrder: 302,
    apiRoutes: [
      route("PUT", "/api/modules/work/tasks/reports", "汇报审批前的本地草稿保存"),
      route("POST", "/api/modules/work/tasks/submissions"),
      route("POST", "/api/modules/work/tasks/submissions/:id/submit"),
    ],
    notes: "个人目标或个人考核口径的考核结果提交流程。",
  },
  {
    key: "work.tasks.goal.department.objective.revise",
    label: "部门期初目标修订",
    writeKind: "revise",
    targetKind: "WorkRevision",
    settingsSortOrder: 201,
    apiRoutes: [route("POST", "/api/modules/work/tasks/submissions")],
    notes: "已确认组织目标口径的实质修订流程。",
  },
  {
    key: "work.tasks.goal.personal.objective.revise",
    label: "个人期初目标修订",
    writeKind: "revise",
    targetKind: "WorkRevision",
    settingsSortOrder: 202,
    apiRoutes: [route("POST", "/api/modules/work/tasks/submissions")],
    notes: "个人期初目标或个人重点计划的实质修订流程。",
  },
  {
    key: "work.tasks.goal.department.report.correct",
    label: "部门考核结果修订",
    writeKind: "revise",
    targetKind: "WorkRevision",
    settingsSortOrder: 401,
    apiRoutes: [route("POST", "/api/modules/work/tasks/submissions")],
    notes: "已确认组织考核结果的修订流程。",
  },
  {
    key: "work.tasks.goal.personal.report.correct",
    label: "个人考核结果修订",
    writeKind: "revise",
    targetKind: "WorkRevision",
    settingsSortOrder: 402,
    apiRoutes: [route("POST", "/api/modules/work/tasks/submissions")],
    notes: "已确认个人考核结果的修订流程。",
  },
] as const;

export type WorkGoalActionKey = (typeof WORK_GOAL_ACTION_DESCRIPTORS)[number]["key"];
export type WorkGoalActionDescriptor = (typeof WORK_GOAL_ACTION_DESCRIPTORS)[number];

export function getWorkGoalActionDescriptor(key: WorkGoalActionKey): WorkGoalActionDescriptor {
  const descriptor = WORK_GOAL_ACTION_DESCRIPTORS.find((item) => item.key === key);
  if (!descriptor) throw new Error(`Unknown Work goal action: ${key}`);
  return descriptor;
}
