import type { SourceCodeAnalysisModuleCategory } from "../../../packages/platform/source-code-analysis-contract";

export interface SourceModuleDeclaration {
  key: string;
  label: string;
  category: SourceCodeAnalysisModuleCategory;
  ownerResourceKey: string | null;
  interfacePaths: string[];
  include: string[];
  exclude?: string[];
}

const BUSINESS_MODULES = [
  { key: "work", label: "工作管理", packageName: "work", appSegment: "work", ownerResourceKey: "work" },
  { key: "hr", label: "人事管理", packageName: "hr", appSegment: "hr", ownerResourceKey: "hr" },
  { key: "administration", label: "行政管理", packageName: "administration", appSegment: "administration", ownerResourceKey: "administration" },
  { key: "finance", label: "财务管理", packageName: "finance", appSegment: "finance", ownerResourceKey: "finance" },
  { key: "production", label: "生产管理", packageName: "production", appSegment: "production", ownerResourceKey: "production" },
  { key: "inventory", label: "存货管理", packageName: "inventory", appSegment: "inventory", ownerResourceKey: "inventory" },
  { key: "external", label: "外部关系", packageName: "external", appSegment: "external", ownerResourceKey: "external" },
  { key: "capital-securities", label: "资本证券", packageName: "capital-securities", appSegment: "capital-securities", legacyApiSegment: "capitalSecurities", ownerResourceKey: "capitalSecurities" },
  { key: "library", label: "资料库", packageName: "library", appSegment: "library", ownerResourceKey: "library" },
] as const;

const businessDeclarations: SourceModuleDeclaration[] = BUSINESS_MODULES.map((module) => ({
  key: module.key,
  label: module.label,
  category: "product",
  ownerResourceKey: module.ownerResourceKey,
  interfacePaths: [
    `packages/${module.packageName}/index.ts`,
    `packages/${module.packageName}/module.ts`,
  ],
  include: [
    `packages/${module.packageName}/`,
    `app/(modules)/${module.appSegment}/`,
    `app/api/modules/${module.appSegment}/`,
    ...("legacyApiSegment" in module ? [`app/api/modules/${module.legacyApiSegment}/`] : []),
  ],
}));

const registeredProductPrefixes = [
  "app/(modules)/agent/",
  "app/(modules)/docs/",
  "app/api/modules/docs/",
  "app/(modules)/settings/",
  "app/api/agent/",
  "app/api/integrations/wecom/agent/",
  "app/api/modules/settings/",
  "app/api/settings/",
];

const applicationShellPrefixes = [
  "app/(auth)/",
  "app/(system)/module-disabled/",
  "app/(system)/portal/",
  "app/error.tsx",
  "app/globals.css",
  "app/layout.tsx",
  "app/page.tsx",
];

/**
 * `scripts/` defaults to development governance. Add a path here only when a
 * production artifact or runtime control plane formally consumes it.
 */
export const PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS = [
  "scripts/import/",
  "scripts/lib/",
  "scripts/migrate/",
  "scripts/repair/",
  "scripts/check/check-permission-action-grants.mjs",
  "scripts/check/check-prisma-deploy-status.js",
  "scripts/ci/check-migration-policy.mjs",
  "scripts/provision-agent-workforce.mjs",
  "scripts/runtime/run-with-repo-node.sh",
  "scripts/runtime/wecom-agent-bot.mjs",
  "scripts/runtime/wecom-agent-delivery.mjs",
  "scripts/runtime/wecom-agent-delivery.test.mjs",
  "scripts/runtime/wecom-agent-input.mjs",
  "scripts/runtime/wecom-agent-input.test.mjs",
  "scripts/runtime/wecom-agent-stream.mjs",
  "scripts/runtime/wecom-agent-stream.test.mjs",
  "scripts/seed-resources-runtime.mjs",
  "scripts/write-resource-manifest.ts",
] as const;
const productionRuntimePaths = ["ops/", ...PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS];
const developmentGovernancePrefixes = ["scripts/", "e2e/"];
const developmentGovernanceRootFiles = ["next.config.ts", "playwright.config.ts"];

const businessOwnedPrefixes = businessDeclarations.flatMap((module) => module.include);

export const SOURCE_MODULE_DECLARATIONS: SourceModuleDeclaration[] = [
  ...businessDeclarations,
  {
    key: "docs",
    label: "文档中心",
    category: "product",
    ownerResourceKey: "docs",
    interfacePaths: [
      "packages/docs/index.ts",
      "packages/docs/server/index.ts",
      "packages/docs/ui/index.ts",
    ],
    include: [
      "app/(modules)/docs/",
      "app/api/modules/docs/",
      "packages/docs/",
    ],
  },
  {
    key: "settings",
    label: "设置",
    category: "product",
    ownerResourceKey: "settings",
    interfacePaths: [
      "packages/settings/index.ts",
      "packages/settings/server/module-management.ts",
      "packages/settings/ui/admin/index.ts",
      "packages/settings/ui/settings/index.ts",
    ],
    include: [
      "app/(modules)/settings/",
      "app/api/modules/settings/",
      "app/api/settings/",
      "packages/settings/",
    ],
  },
  {
    key: "agent",
    label: "智能体",
    category: "product",
    ownerResourceKey: "agent",
    interfacePaths: ["packages/agent/index.ts", "packages/agent/server/index.ts", "packages/agent/ui/index.ts"],
    include: [
      "app/(modules)/agent/",
      "app/api/agent/",
      "app/api/integrations/wecom/agent/",
      "packages/agent/",
    ],
  },
  {
    key: "core",
    label: "核心通用",
    category: "shared",
    ownerResourceKey: null,
    interfacePaths: ["packages/core/index.ts"],
    include: ["packages/core/"],
  },
  {
    key: "platform",
    label: "平台通用",
    category: "shared",
    ownerResourceKey: null,
    interfacePaths: ["packages/platform/index.ts"],
    include: ["packages/platform/", "app/"],
    exclude: [...businessOwnedPrefixes, ...registeredProductPrefixes, ...applicationShellPrefixes],
  },
  {
    key: "application-shell",
    label: "组合层",
    category: "composition",
    ownerResourceKey: null,
    interfacePaths: ["app/layout.tsx"],
    include: applicationShellPrefixes,
  },
  {
    key: "data-model",
    label: "数据底座",
    category: "dataEngineering",
    ownerResourceKey: null,
    interfacePaths: ["prisma/schema.prisma"],
    include: ["prisma/", "prisma.config.ts"],
  },
  {
    key: "operations",
    label: "生产运行",
    category: "engineering",
    ownerResourceKey: null,
    interfacePaths: ["ops/publish.sh"],
    include: productionRuntimePaths,
  },
  {
    key: "tooling",
    label: "开发治理",
    category: "engineering",
    ownerResourceKey: null,
    interfacePaths: ["package.json"],
    include: [
      ...developmentGovernancePrefixes,
      ...developmentGovernanceRootFiles,
    ],
    exclude: [...PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS],
  },
];

function matchesDeclarationPath(relativePath: string, declarationPath: string) {
  return declarationPath.endsWith("/")
    ? relativePath.startsWith(declarationPath)
    : relativePath === declarationPath;
}

function declarationOwnsPath(declaration: SourceModuleDeclaration, relativePath: string) {
  if (!declaration.include.some((candidate) => matchesDeclarationPath(relativePath, candidate))) return false;
  return !(declaration.exclude ?? []).some((candidate) => matchesDeclarationPath(relativePath, candidate));
}

export function sourceModuleDeclarationsForPath(relativePath: string) {
  return SOURCE_MODULE_DECLARATIONS.filter((declaration) => declarationOwnsPath(declaration, relativePath));
}

export const SOURCE_CODE_ROOTS = ["app", "packages", "prisma", "scripts", "ops", "e2e"] as const;
export const ROOT_SOURCE_FILES = ["next.config.ts", "prisma.config.ts", "playwright.config.ts"] as const;
