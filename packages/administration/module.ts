import type { WorkspacePackageRegistration } from "@workspace/core";

export const moduleDefinition: WorkspacePackageRegistration = {
  packageName: "@workspace/administration",
  layer: "domain",
  moduleDef: {
    key: "administration",
    label: "行政管理",
    desc: "合同台账、办公事务",
    href: "/administration",
    iconKey: "admin",
    color: "indigo",
    resourceKey: "administration",
    children: [
      {
        key: "contracts",
        label: "合同台账",
        desc: "合同录入、查询、到期预警",
        href: "/contracts",
        resourceKey: "administration.contract",
      },
    ],
  },
  resourceDefs: [
    { key: "administration", name: "行政管理", sortOrder: 2 },
    { key: "administration.contract", name: "合同台账", parentKey: "administration", sortOrder: 0 },
  ],
  routes: ["/administration", "/contracts"],
  apiGuards: [
    { method: "GET", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "access" },
    { method: "POST", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "write" },
    { method: "PATCH", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "write" },
    { method: "DELETE", pathPrefix: "/api/contracts", resourceKey: "administration.contract", action: "delete" },
  ],
};

export const administrationPackage = moduleDefinition;
