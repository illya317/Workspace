import type { WorkspacePackageRegistration } from "@workspace/core";

export const moduleDefinition: WorkspacePackageRegistration = {
  packageName: "@workspace/hr",
  layer: "domain",
  moduleDef: {
    key: "hr",
    label: "人事管理",
    desc: "花名册、考勤、绩效、人力分析",
    href: "/hr",
    iconKey: "hr",
    color: "blue",
    resourceKey: "people",
    children: [
      { key: "roster", label: "人事基础资料", desc: "员工、雇佣、合同、部门、岗位、EDP", href: "/hr/roster", resourceKey: "people.roster" },
      { key: "performance", label: "考勤绩效", desc: "考勤记录、工作查看、绩效评估", href: "/hr/performance", resourceKey: "people.performance" },
      { key: "analytics", label: "人力分析", desc: "员工结构、部门架构、岗位分析、人员流动", href: "/hr/analytics", resourceKey: "people.analytics" },
    ],
  },
  resourceDefs: [
    { key: "people", name: "人事管理", sortOrder: 1 },
    { key: "people.roster", name: "人事基础资料", parentKey: "people", sortOrder: 0 },
    { key: "people.performance", name: "考勤绩效", parentKey: "people", sortOrder: 1 },
    { key: "people.analytics", name: "人力分析", parentKey: "people", sortOrder: 2 },
  ],
  routes: ["/hr", "/hr/roster", "/hr/performance", "/hr/analytics"],
  apiGuards: [
    { method: "GET", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "access" },
    { method: "POST", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
    { method: "PUT", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
    { method: "PATCH", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "write" },
    { method: "DELETE", pathPrefix: "/api/hr", resourceKey: "people.roster", action: "delete" },
  ],
};

export const hrPackage = moduleDefinition;
