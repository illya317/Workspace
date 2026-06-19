import type { WorkspacePackageRegistration } from "@workspace/core";
import { administrationPackage } from "@workspace/administration";
import { financePackage } from "@workspace/finance";
import { hrPackage } from "@workspace/hr";
import { libraryPackage } from "@workspace/library";
import { productionPackage } from "@workspace/production";
import { workPackage } from "@workspace/work";

export const platformPackages: WorkspacePackageRegistration[] = [
  workPackage,
  hrPackage,
  administrationPackage,
  financePackage,
  productionPackage,
  {
    packageName: "@workspace/platform:external",
    layer: "platform",
    moduleDef: {
      key: "external",
      label: "外部关系",
      desc: "客户、投资人、供应商",
      href: "/external",
      iconKey: "customers",
      color: "orange",
      resourceKey: "external",
      lifecycleStatus: "workspace-analysis",
      children: [
        { key: "investors", label: "投资人关系", desc: "投资人信息、沟通记录", href: "/external/investors", resourceKey: "external.investor", lifecycleStatus: "workspace-owned" },
        { key: "customers", label: "客户管理", desc: "客户信息、跟进记录", href: "/external/customers", resourceKey: "external.customer", lifecycleStatus: "workspace-analysis" },
        { key: "suppliers", label: "供应商管理", desc: "供应商信息、采购记录", href: "/external/suppliers", resourceKey: "external.supplier", lifecycleStatus: "workspace-analysis" },
      ],
    },
    resourceDefs: [
      { key: "external", name: "外部关系", maxRoleKey: "delete", sortOrder: 5 },
      { key: "external.investor", name: "投资人关系", parentKey: "external", maxRoleKey: "delete", sortOrder: 0 },
      { key: "external.customer", name: "客户管理", parentKey: "external", maxRoleKey: "delete", sortOrder: 1 },
      { key: "external.supplier", name: "供应商管理", parentKey: "external", maxRoleKey: "delete", sortOrder: 2 },
    ],
  },
  {
    packageName: "@workspace/platform:docs",
    layer: "platform",
    moduleDef: {
      key: "docs",
      label: "文档中心",
      desc: "员工手册、操作指南、规章制度",
      href: "/docs",
      iconKey: "docs",
      color: "purple",
      resourceKey: "docs",
      children: [
        { key: "positions", label: "岗位说明书", desc: "GMP 岗位说明书", href: "/docs/positions/GMP", resourceKey: "docs.positions" },
        { key: "company", label: "公司管理", desc: "员工手册、管理手册", href: "/docs/company", resourceKey: "docs.company" },
        { key: "expense", label: "报销规范", desc: "报销流程与标准", href: "/docs/expense", resourceKey: "docs.expense" },
        { key: "api-guide", label: "接入指南", desc: "API 接入文档与示例", href: "/docs/api-guide", resourceKey: "system.api" },
      ],
    },
    resourceDefs: [
      { key: "docs", name: "文档中心", maxRoleKey: "access", sortOrder: 6 },
      { key: "docs.positions", name: "岗位说明书", parentKey: "docs", maxRoleKey: "access", sortOrder: 0 },
      { key: "docs.company", name: "公司管理", parentKey: "docs", maxRoleKey: "access", sortOrder: 1 },
      { key: "docs.expense", name: "报销规范", parentKey: "docs", maxRoleKey: "access", sortOrder: 2 },
    ],
  },
  libraryPackage,
  {
    packageName: "@workspace/platform:settings",
    layer: "platform",
    moduleDef: {
      key: "settings",
      label: "设置",
      desc: "个人设置、系统配置",
      href: "/settings",
      iconKey: "settings",
      color: "orange",
    },
  },
  {
    packageName: "@workspace/platform:system",
    layer: "platform",
    resourceDefs: [
      { key: "system", name: "系统管理", sortOrder: 9 },
      { key: "system.audit", name: "审计日志", parentKey: "system", sortOrder: 0 },
      { key: "system.agent", name: "智能体", parentKey: "system", maxRoleKey: "access", sortOrder: 1 },
      { key: "system.api", name: "API接入", parentKey: "system", maxRoleKey: "access", sortOrder: 2 },
    ],
  },
  {
    packageName: "@workspace/platform:legal",
    layer: "platform",
    resourceDefs: [
      { key: "legal", name: "法务", maxRoleKey: "access", sortOrder: 8 },
      { key: "legal.chat", name: "法务咨询", parentKey: "legal", maxRoleKey: "access", sortOrder: 0 },
      { key: "legal.document", name: "法律文书", parentKey: "legal", maxRoleKey: "access", sortOrder: 1 },
    ],
  },
];

export const workspacePackages = platformPackages;
