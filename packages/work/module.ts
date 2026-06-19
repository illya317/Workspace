import type { WorkspacePackageRegistration } from "@workspace/core";

export const workPackage: WorkspacePackageRegistration = {
  packageName: "@workspace/work",
  layer: "domain",
  moduleDef: {
    key: "work",
    label: "工作管理",
    desc: "工作计划、清单、汇报和历史记录",
    href: "/work",
    iconKey: "reports",
    color: "emerald",
    resourceKey: "work",
    children: [
      { key: "plans", label: "工作计划", desc: "计划信息、角色分工、预算和风险", href: "/work/plans", resourceKey: "work.plan" },
      { key: "tasks", label: "工作清单", desc: "待办任务和执行跟踪", href: "/works", resourceKey: "work.task" },
      { key: "reports", label: "工作汇报", desc: "周报、月报、季报、年报", href: "/reports", resourceKey: "work.report" },
      { key: "history", label: "历史记录", desc: "变更和操作记录", href: "/history", resourceKey: "work.history" },
    ],
  },
  resourceDefs: [
    { key: "work", name: "工作管理", sortOrder: 0 },
    { key: "work.plan", name: "工作计划", parentKey: "work", sortOrder: 0 },
    { key: "work.task", name: "工作清单", parentKey: "work", sortOrder: 1 },
    { key: "work.report", name: "工作汇报", parentKey: "work", sortOrder: 2 },
    { key: "work.history", name: "历史记录", parentKey: "work", sortOrder: 3 },
  ],
  routes: ["/work", "/work/plans", "/works", "/reports", "/history"],
  apiGuards: [
    { method: "GET", pathPrefix: "/api/work", resourceKey: "work.plan", action: "access" },
    { method: "POST", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
    { method: "PUT", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
    { method: "PATCH", pathPrefix: "/api/work", resourceKey: "work.plan", action: "write" },
    { method: "DELETE", pathPrefix: "/api/work", resourceKey: "work.plan", action: "delete" },
  ],
};
