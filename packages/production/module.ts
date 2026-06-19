import type { WorkspacePackageRegistration } from "@workspace/core";

export const productionPackage: WorkspacePackageRegistration = {
  packageName: "@workspace/production",
  layer: "domain",
  moduleDef: {
    key: "production",
    label: "生产管理",
    desc: "批次检验、检验模板",
    href: "/production",
    iconKey: "production",
    color: "cyan",
    resourceKey: "production",
    children: [
      { key: "qcBatches", label: "批次检验", desc: "批次创建、检验记录填写、提交复核", href: "/production/qc/batches", resourceKey: "production.qc.batches" },
      { key: "qcTemplates", label: "检验模板", desc: "模板结构浏览、版式预览、反馈收集", href: "/production/qc/templates", resourceKey: "production.qc.templates" },
    ],
  },
  resourceDefs: [
    { key: "production", name: "生产管理", sortOrder: 4 },
    { key: "production.inventory", name: "生产库存", parentKey: "production", sortOrder: 99 },
    { key: "production.qc", name: "质量检验", parentKey: "production", sortOrder: 0 },
    { key: "production.qc.batches", name: "批次检验", parentKey: "production.qc", sortOrder: 0 },
    { key: "production.qc.templates", name: "检验模板", parentKey: "production.qc", sortOrder: 1 },
  ],
  routes: ["/production", "/production/qc/batches", "/production/qc/templates"],
  apiGuards: [
    { method: "GET", pathPrefix: "/api/production", resourceKey: "production", action: "access" },
    { method: "POST", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
    { method: "PUT", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
    { method: "PATCH", pathPrefix: "/api/production", resourceKey: "production", action: "write" },
    { method: "DELETE", pathPrefix: "/api/production", resourceKey: "production", action: "delete" },
  ],
};
