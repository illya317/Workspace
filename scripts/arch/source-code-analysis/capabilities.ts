import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CAPABILITY_GOVERNED_MODULE_KEYS,
  type CapabilityGovernedModuleKey,
  type SourceCapabilityDeclaration,
  type SourceCapabilityOptions,
  type SourceCapabilityPathOptions,
  type SourceCapabilityPathRule,
} from "./capability-declaration-contract";
import { SOURCE_CAPABILITY_INTERFACE_FILES } from "./capability-interfaces";
import { createProductCapabilityDeclarations } from "./product-capability-declarations";
import { sourceModuleDeclarationsForPath } from "./declarations";
import {
  OPERATIONS_ARTIFACT_SUPPLY_FILES,
  OPERATIONS_DATA_RELEASE_FILES,
  OPERATIONS_DEPLOYMENT_CUTOVER_FILES,
  OPERATIONS_FOUNDATION_FILES,
  OPERATIONS_RELEASE_CI_FILES,
  OPERATIONS_RUNTIME_DEPENDENCY_FILES,
} from "./operations-capability-file-catalog";

export { CAPABILITY_GOVERNED_MODULE_KEYS };
export type {
  CapabilityGovernedModuleKey,
  SourceCapabilityDeclaration,
  SourceCapabilityPathRule,
};

export interface CapabilityOwnershipBaseline {
  schemaVersion: 1;
  legacyUnclassifiedFiles: Partial<Record<CapabilityGovernedModuleKey, string[]>>;
}

export const CAPABILITY_OWNERSHIP_BASELINE_PATH =
  "scripts/arch/source-code-analysis/capability-ownership-baseline.json";

function rules(
  moduleKey: CapabilityGovernedModuleKey,
  options: SourceCapabilityPathOptions,
): SourceCapabilityPathRule[] {
  const packagePrefix = `packages/${moduleKey}/`;
  return [
    ...(options.files ?? []).map((relativePath) => ({
      kind: "file" as const,
      path: `${packagePrefix}${relativePath}`,
    })),
    ...(options.prefixes ?? []).map((relativePath) => ({
      kind: "prefix" as const,
      path: `${packagePrefix}${relativePath}`,
    })),
    ...(options.directChildren ?? []).map((relativePath) => ({
      kind: "directChildren" as const,
      path: `${packagePrefix}${relativePath}`,
    })),
    ...(options.rootDirectChildren ?? []).map((rootPath) => ({
      kind: "directChildren" as const,
      path: rootPath,
    })),
    ...(options.rootFiles ?? []).map((rootPath) => ({ kind: "file" as const, path: rootPath })),
    ...(options.rootPrefixes ?? []).map((rootPath) => ({ kind: "prefix" as const, path: rootPath })),
  ];
}

export function capability(
  moduleKey: CapabilityGovernedModuleKey,
  key: string,
  label: string,
  options: SourceCapabilityOptions,
): SourceCapabilityDeclaration {
  const registeredInterfaceFiles = SOURCE_CAPABILITY_INTERFACE_FILES[`${moduleKey}/${key}`] ?? [];
  return {
    moduleKey,
    key,
    kind: options.kind ?? "module",
    parentKey: options.parentKey ?? null,
    label,
    include: rules(moduleKey, options),
    interface: rules(moduleKey, {
      files: [...registeredInterfaceFiles, ...(options.interfaceFiles ?? [])],
      prefixes: options.interfacePrefixes,
    }),
  };
}

export const SOURCE_CAPABILITY_DECLARATIONS: readonly SourceCapabilityDeclaration[] = [
  capability("platform", "entry", "L1 接入与组合层", {
    kind: "entry",
    rootPrefixes: ["app/"],
  }),
  capability("platform", "shell-navigation", "应用壳与导航", {
    files: [
      "effective-module-registry.ts", "mobile-experience.ts", "modules.tsx",
      "portal-preferences.test.ts", "portal-preferences.ts", "view-registry.test.ts", "view-registry.ts",
      "ui/AppShell.tsx", "ui/AppVersionGuard.tsx", "ui/ModuleHome.tsx", "ui/NavLink.tsx",
      "ui/PortalClient.tsx", "ui/app-shell-page.tsx", "ui/portal-page.tsx",
      "ui/portal-preferences.ts", "ui/useDeployUnitNavigation.ts",
      "server/app-version.ts", "server/deploy-unit-runtime.test.ts", "server/deploy-unit-runtime.ts", "server/module-home-page.tsx",
      "server/module-runtime-overrides.ts", "server/module-runtime.ts",
    ],
    prefixes: ["module-", "server/module-", "ui/system/"],
  }),
  capability("platform", "identity-access", "身份、权限与空间访问", {
    files: [
      "permissions.ts", "resources.ts", "ui/LoginClient.tsx", "ui/PermissionActionMatrixGrid.tsx",
      "ui/SpacePermissionsPanel.tsx", "ui/UserMenu.tsx", "server/account.ts",
      "server/account-api-key.test.ts", "server/account-avatar-library.ts", "server/admin-projects.ts",
      "server/api-access.ts", "server/auth-token.ts", "server/auth.ts", "server/protected-page.tsx",
      "server/resource-authorization.ts", "server/security.ts", "server/standard-space-permission-route.ts",
      "server/with-auth.ts", "server/permissions.ts", "personal-api-catalog.test.ts",
      "ui/permission-matrix-model.ts",
    ],
    prefixes: [
      "permission-", "space-", "server/auth/", "server/rbac/", "server/permission-",
      "server/personal-api-", "server/space-", "server/user-", "server/usernames.",
      "server/users.", "server/business-space-", "ui/auth/", "ui/space-",
    ],
  }),
  capability("platform", "workflow-approvals", "工作流与审批", {
    files: [
      "server/approvals.ts", "server/approvals-list-filter.test.ts",
      "ui/WorkflowStatusBadge.tsx", "ui/workflow.tsx",
      "work-goal-action-descriptors.ts", "work-reporting-policy.test.ts", "work-reporting-policy.ts",
    ],
    prefixes: [
      "workflow-", "server/approval-", "server/approvals/", "server/workflow-",
      "server/workflows.", "ui/workflow/",
    ],
  }),
  capability("platform", "relations-data", "关系、引用与主数据", {
    files: [
      "relation-registration-contract.ts", "server/company-directory.ts",
      "server/organization-units.ts", "server/product-master.ts",
    ],
    prefixes: [
      "server/dal/", "server/fk-", "server/reference-", "server/relation-",
      "server/resolve-fk.", "server/party-", "ui/organization-units/",
    ],
  }),
  capability("platform", "workspace-analysis", "工作区分析运行时", {
    prefixes: ["workspace-analysis-", "server/workspace-analysis-", "ui/workspace-analysis-"],
  }),
  capability("platform", "documents-content", "文档与内容处理", {
    files: [
      "office-preview.ts", "pdf-optimization.ts", "server/company-documents.ts",
      "server/docs-editor-space-adapter.ts", "server/onlyoffice-viewer.ts", "server/pdf-optimization.ts",
      "server/authoritative-library-source-client.ts", "server/authoritative-library-source-contract.test.ts",
      "server/authoritative-library-source-contract.ts", "server/authoritative-library-source-route.ts",
      "server/business-document-intelligence-client.test.ts", "server/business-document-intelligence-client.ts",
      "server/business-document-intelligence-contract.ts",
    ],
    prefixes: [
      "document-editor/", "formula/", "server/document-template-",
      "ui/period-dossier/", "ui/position-description/",
    ],
  }),
  capability("platform", "business-governance", "业务动作与治理", {
    files: [
      "action-contract.ts", "action-registry.ts", "api-registry-finance.test.ts", "api-registry.ts",
      "business-code-config-contract.ts", "open-api-registry.ts", "server/data-quality.ts",
      "ui/business-temporal-records.test.ts", "ui/business-temporal-records.ts",
      "ui/business-temporal-view.test.ts", "ui/business-temporal-view.ts",
    ],
    prefixes: [
      "action-contract-", "action-registry-", "business-action-", "business-code-",
      "data-quality-", "mutation-impact-", "server/business-action-", "server/business-code-",
      "server/business-codes/", "server/business-temporal-", "server/data-quality-",
      "server/direct-command-", "server/mutation-impact/", "server/mutation-impact-",
    ],
  }),
  capability("platform", "notifications", "通知与待办投递", {
    files: ["notification-open-api-registry.test.ts", "ui/NotificationBell.tsx"],
    prefixes: ["server/notification-", "server/notifications."],
  }),
  capability("platform", "agent-runtime", "智能体平台运行时", {
    files: ["ui/AgentConversationSurface.tsx", "ui/agent-markdown.ts", "server/artifact-claims-input.ts"],
    prefixes: ["agent-", "server/agent-", "server/wecom-"],
  }),
  capability("platform", "shared-ui", "共享界面能力", {
    files: [
      "icons.tsx", "period-dossier.ts", "ui/PageAssistantProvider.tsx", "ui/api-client.test.ts",
      "ui/api-client.ts", "ui/category-item-detail-workspace.test.ts",
      "ui/category-item-detail-workspace.ts", "ui/department-home.tsx", "ui/index.ts",
      "ui/responsibility-fields.ts",
    ],
    prefixes: ["hooks/", "ui/page-assistant/"],
  }),
  capability("platform", "platform-foundation", "平台基础契约与运行支撑", {
    files: [
      "README.md", "api-contract-types.ts", "completion-date-policy.ts", "index.ts", "package.json",
      "deploy-unit-catalog.ts", "production-batch-number.ts", "route-runtime-labels.test.ts", "route-runtime-labels.ts",
      "search.ts", "service-result.ts", "source-code-analysis-contract.ts", "tenant-config.ts",
      "tsconfig.json", "server/api-route.ts", "server/api.test.ts", "server/api.ts",
      "server/audit-log.ts", "server/business-date.test.ts", "server/business-date.ts",
      "server/crud-factory.ts", "server/delete-guard.ts", "server/domain-validation.ts",
      "server/history-policy-registry.test.ts", "server/history-policy-registry.ts", "server/history.ts",
      "server/internal-unit-identity.test.ts", "server/internal-unit-identity.ts",
      "server/internal-unit-rpc.test.ts", "server/internal-unit-rpc.ts", "server/prisma.ts",
      "server/serializable-transaction.ts", "server/source-code-analysis.ts", "server/system-config.ts",
      "server/tenant-config.ts", "server/week-info.ts", "ui/TenantConfigProvider.tsx", "ui/tenant-config.tsx",
    ],
    prefixes: ["audit/", "calendar/", "contracts/", "integrations/", "server/api/", "server/open-api/", "types/"],
  }),

  ...createProductCapabilityDeclarations(capability),
  capability("data-model", "schema-entry", "数据模型组合入口", {
    kind: "entry",
    rootFiles: ["prisma/schema.prisma", "prisma.config.ts"],
  }),
  capability("data-model", "model-contracts", "领域数据模型", {
    rootPrefixes: ["prisma/models/"],
  }),
  capability("data-model", "migration-history", "迁移历史", {
    kind: "appendOnlyHistory",
    rootPrefixes: ["prisma/migrations/"],
  }),
  capability("data-model", "seed-data", "种子与参考数据", {
    rootPrefixes: ["prisma/seed-data/"],
  }),
  capability("data-model", "data-release-contracts", "数据发布契约", {
    rootFiles: ["ops/data-release-reference-contracts.mjs"],
  }),

  capability("operations", "operations-foundation", "生产运行底座", {
    rootPrefixes: [
      "ops/", "scripts/import/", "scripts/lib/", "scripts/migrate/", "scripts/repair/",
      "scripts/deploy/", "scripts/runtime/", "scripts/testing/",
    ],
    rootFiles: OPERATIONS_FOUNDATION_FILES,
  }),
  capability("operations", "operations-commands", "生产运行命令", {
    kind: "orchestrator",
    parentKey: "operations-foundation",
    rootDirectChildren: ["ops/"],
  }),
  capability("operations", "operations-control", "生产控制面命令", {
    kind: "orchestrator",
    parentKey: "operations-commands",
    rootDirectChildren: ["ops/"],
  }),
  capability("operations", "release-ci", "Release CI", {
    parentKey: "operations-control",
    rootFiles: OPERATIONS_RELEASE_CI_FILES,
  }),
  capability("operations", "artifact-supply", "制品构建与供应", {
    parentKey: "operations-control",
    rootFiles: OPERATIONS_ARTIFACT_SUPPLY_FILES,
  }),
  capability("operations", "deployment-cutover", "部署切换", {
    parentKey: "operations-control",
    rootFiles: OPERATIONS_DEPLOYMENT_CUTOVER_FILES,
  }),
  capability("operations", "runtime-dependencies", "运行依赖", {
    parentKey: "operations-control",
    rootFiles: OPERATIONS_RUNTIME_DEPENDENCY_FILES,
  }),
  capability("operations", "data-release", "数据发布", {
    parentKey: "operations-control",
    rootFiles: OPERATIONS_DATA_RELEASE_FILES,
  }),
  capability("operations", "deploy-runtime", "部署切换运行时", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/deploy/"],
  }),
  capability("operations", "release-pipeline", "发布控制流水线", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/release/"],
  }),
  capability("operations", "release-ci-steps", "Release CI 步骤", {
    parentKey: "release-pipeline",
    rootPrefixes: ["ops/release/attempts/", "ops/release/validation/"],
  }),
  capability("operations", "release-ready", "Ready 与制品验收", {
    parentKey: "release-pipeline",
    rootPrefixes: ["ops/release/readiness/"],
  }),
  capability("operations", "release-control", "发布契约与控制", {
    parentKey: "release-pipeline",
    rootPrefixes: [
      "ops/release/candidate/", "ops/release/contracts/", "ops/release/control/", "ops/release/diagnostics/",
    ],
  }),
  capability("operations", "database-runtime", "数据库运行保障", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/postgresql/"],
  }),
  capability("operations", "cache-runtime", "运行缓存治理", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/cache/"],
  }),
  capability("operations", "document-runtime", "文档运行环境", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/onlyoffice/"],
  }),
  capability("operations", "operations-support", "生产运行公共脚本", {
    parentKey: "operations-foundation",
    rootPrefixes: ["ops/lib/", "scripts/lib/"],
  }),
  capability("operations", "data-import", "生产数据导入", {
    parentKey: "operations-foundation",
    rootPrefixes: ["scripts/import/"],
  }),
  capability("operations", "historical-maintenance", "历史迁移修复", {
    parentKey: "operations-foundation",
    rootPrefixes: ["scripts/migrate/", "scripts/repair/"],
  }),
  capability("operations", "data-migration", "生产数据迁移", {
    parentKey: "historical-maintenance",
    rootPrefixes: ["scripts/migrate/"],
  }),
  capability("operations", "data-repair", "生产数据修复", {
    parentKey: "historical-maintenance",
    rootPrefixes: ["scripts/repair/"],
  }),
  capability("operations", "deploy-model", "部署模型生成", {
    parentKey: "operations-foundation",
    rootPrefixes: ["scripts/deploy/"],
  }),
  capability("operations", "agent-runtime", "智能体生产运行时", {
    parentKey: "operations-foundation",
    rootPrefixes: ["scripts/runtime/"],
  }),
  capability("operations", "operations-policy", "生产运行校验策略", {
    parentKey: "operations-foundation",
    rootFiles: [
      "scripts/check/check-permission-action-grants.mjs",
      "scripts/check/check-prisma-deploy-status.js",
      "scripts/ci/check-migration-policy.mjs",
      "scripts/ci/verify-artifact-manifest.mjs",
      "scripts/testing/module-impact-map.ts",
    ],
  }),
  capability("operations", "runtime-provisioning", "生产运行初始化", {
    parentKey: "operations-foundation",
    rootFiles: [
      "scripts/provision-agent-workforce.mjs",
      "scripts/seed-resources-runtime.mjs",
      "scripts/write-resource-manifest.ts",
    ],
  }),

  capability("tooling", "tooling-foundation", "开发治理底座", {
    rootPrefixes: ["scripts/", "e2e/", ".github/workflows/"],
  }),
  capability("tooling", "tooling-entry", "开发治理组合入口", {
    kind: "entry",
    rootFiles: ["dependency-cruiser.config.cjs", "next.config.ts", "package.json", "playwright.config.ts"],
  }),
  capability("tooling", "architecture-governance", "架构治理", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/arch/"],
  }),
  capability("tooling", "source-module-governance", "源码模块与依赖治理", {
    parentKey: "architecture-governance",
    rootPrefixes: ["scripts/arch/source-code-analysis/"],
  }),
  capability("tooling", "ui-structure-governance", "UI 结构治理", {
    parentKey: "architecture-governance",
    rootFiles: [
      "scripts/arch/action-runtime-ui.ts", "scripts/arch/body-command-renderer.ts",
      "scripts/arch/feedback-api.ts", "scripts/arch/field-layout.ts",
    ],
    rootPrefixes: [
      "scripts/arch/core-ui-", "scripts/arch/create-surface-", "scripts/arch/form-surface-",
      "scripts/arch/input-surface-", "scripts/arch/modal-governance", "scripts/arch/page-surface-",
      "scripts/arch/structure-", "scripts/arch/surface-", "scripts/arch/table-row-", "scripts/arch/ui-",
    ],
  }),
  capability("tooling", "domain-contract-governance", "领域与接口契约治理", {
    parentKey: "architecture-governance",
    rootFiles: [
      "scripts/arch/app-route-hierarchy.ts", "scripts/arch/auth.ts", "scripts/arch/deps.ts",
      "scripts/arch/modules.ts", "scripts/arch/open-api.ts",
    ],
    rootPrefixes: [
      "scripts/arch/business-temporal-", "scripts/arch/completion-date-", "scripts/arch/domain-",
      "scripts/arch/finance-workbook-", "scripts/arch/package-dependency-",
    ],
  }),
  capability("tooling", "static-analysis", "静态检查", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/check/"],
  }),
  capability("tooling", "check-orchestration", "检查编排与缓存", {
    parentKey: "static-analysis",
    rootFiles: ["scripts/check/with-check-lock.js"],
    rootPrefixes: ["scripts/check/changed-files", "scripts/check/run-", "scripts/check/check-task-"],
  }),
  capability("tooling", "contract-checks", "注册、权限与接口检查", {
    parentKey: "static-analysis",
    rootPrefixes: [
      "scripts/check/action-contract-", "scripts/check/approval-authority-",
      "scripts/check/business-action-", "scripts/check/check-action-", "scripts/check/check-api-",
      "scripts/check/check-authorize-", "scripts/check/check-business-action-",
      "scripts/check/check-business-code-registry", "scripts/check/check-business-identity-",
      "scripts/check/check-business-temporal-", "scripts/check/check-fk-", "scripts/check/check-history-",
      "scripts/check/check-notification-", "scripts/check/check-permission-",
      "scripts/check/check-relation-", "scripts/check/check-resource-",
      "scripts/check/check-work-plan-", "scripts/check/check-workspace-analysis-",
      "scripts/check/docs-approval-", "scripts/check/mutation-impact-", "scripts/check/notification-audit-",
      "scripts/check/permission-review", "scripts/check/relation-adapter-",
      "scripts/check/relation-policy-", "scripts/check/service-result-", "scripts/check/verified-api-",
      "scripts/check/work-completion-", "scripts/check/work-item-", "scripts/check/work-mutation-",
      "scripts/check/work-task-",
    ],
  }),
  capability("tooling", "action-workflow-checks", "动作与工作流契约检查", {
    parentKey: "contract-checks",
    rootPrefixes: [
      "scripts/check/action-contract-", "scripts/check/approval-authority-",
      "scripts/check/business-action-", "scripts/check/check-action-",
      "scripts/check/check-business-action-", "scripts/check/check-business-temporal-",
      "scripts/check/docs-approval-", "scripts/check/mutation-impact-",
      "scripts/check/notification-audit-", "scripts/check/service-result-",
      "scripts/check/work-completion-", "scripts/check/work-item-", "scripts/check/work-mutation-",
      "scripts/check/work-task-",
    ],
  }),
  capability("tooling", "registry-access-checks", "Registry 与访问控制检查", {
    parentKey: "contract-checks",
    rootFiles: ["scripts/check/check-module-definitions.js"],
    rootPrefixes: [
      "scripts/check/check-api-", "scripts/check/check-authorize-", "scripts/check/check-fk-",
      "scripts/check/check-history-", "scripts/check/check-notification-",
      "scripts/check/check-permission-", "scripts/check/check-relation-",
      "scripts/check/check-resource-", "scripts/check/check-work-plan-",
      "scripts/check/check-workspace-analysis-", "scripts/check/permission-review",
      "scripts/check/relation-adapter-", "scripts/check/relation-policy-",
      "scripts/check/verified-api-",
    ],
  }),
  capability("tooling", "access-policy-checks", "访问与权限策略检查", {
    parentKey: "registry-access-checks",
    rootPrefixes: [
      "scripts/check/check-api-", "scripts/check/check-authorize-",
      "scripts/check/check-permission-", "scripts/check/permission-review",
      "scripts/check/verified-api-",
    ],
  }),
  capability("tooling", "registry-consistency-checks", "Registry 一致性检查", {
    parentKey: "registry-access-checks",
    rootFiles: ["scripts/check/check-module-definitions.js"],
    rootPrefixes: [
      "scripts/check/check-fk-", "scripts/check/check-history-", "scripts/check/check-notification-",
      "scripts/check/check-relation-", "scripts/check/check-resource-", "scripts/check/check-work-plan-",
      "scripts/check/check-workspace-analysis-", "scripts/check/relation-adapter-",
      "scripts/check/relation-policy-",
    ],
  }),
  capability("tooling", "relation-registry-checks", "关系与资源 Registry 检查", {
    parentKey: "registry-consistency-checks",
    rootPrefixes: [
      "scripts/check/check-fk-", "scripts/check/check-relation-", "scripts/check/check-resource-",
      "scripts/check/relation-adapter-", "scripts/check/relation-policy-",
    ],
  }),
  capability("tooling", "module-registry-checks", "模块与运行 Registry 检查", {
    parentKey: "registry-consistency-checks",
    rootFiles: ["scripts/check/check-module-definitions.js"],
    rootPrefixes: [
      "scripts/check/check-history-", "scripts/check/check-notification-",
      "scripts/check/check-work-plan-", "scripts/check/check-workspace-analysis-",
    ],
  }),
  capability("tooling", "data-lifecycle-checks", "数据与生命周期检查", {
    parentKey: "static-analysis",
    rootPrefixes: [
      "scripts/check/business-lifecycle-", "scripts/check/check-database-", "scripts/check/check-db.",
      "scripts/check/check-finance-", "scripts/check/check-import-", "scripts/check/check-prisma-",
      "scripts/check/check-schema-", "scripts/check/hr-business-", "scripts/check/normalize-generated-",
      "scripts/check/organization-lifecycle-", "scripts/check/prisma-relation-",
      "scripts/check/relation-dmmf-",
    ],
  }),
  capability("tooling", "runtime-delivery-checks", "运行与交付检查", {
    parentKey: "static-analysis",
    rootPrefixes: [
      "scripts/check/check-deploy-", "scripts/check/check-env.", "scripts/check/check-standalone-",
      "scripts/check/check-tenant-runtime-", "scripts/check/check-workspace-runtime",
      "scripts/check/deploy/", "scripts/check/prepare-standalone-",
    ],
  }),
  capability("tooling", "ui-quality-checks", "UI 与浏览器检查", {
    parentKey: "static-analysis",
    rootPrefixes: [
      "scripts/check/check-core-ui-", "scripts/check/check-docs-editor-",
      "scripts/check/check-module-nav-", "scripts/check/check-module-page-",
      "scripts/check/check-playwright-", "scripts/check/module-page-gate-",
    ],
  }),
  capability("tooling", "repository-quality-checks", "仓库与工程质量检查", {
    parentKey: "static-analysis",
    rootPrefixes: [
      "scripts/check/check-architecture-", "scripts/check/check-company-", "scripts/check/check-memory-",
      "scripts/check/check-net-", "scripts/check/check-package-", "scripts/check/check-split-",
      "scripts/check/check-typecheck-", "scripts/check/check-business-code-hardcoding",
      "scripts/check/governance-checker-", "scripts/check/tenant-hardcoding-",
      "scripts/check/typecheck-entrypoints", "scripts/check/workspace-package-",
    ],
  }),
  capability("tooling", "continuous-integration", "持续集成", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/ci/"],
  }),
  capability("tooling", "deployment-tooling", "部署开发工具", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/deploy/"],
  }),
  capability("tooling", "developer-runtime", "开发运行环境", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/runtime/"],
  }),
  capability("tooling", "test-harness", "测试支撑", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/testing/", "e2e/"],
  }),
  capability("tooling", "test-infrastructure", "测试基础设施", {
    parentKey: "test-harness",
    rootPrefixes: ["scripts/testing/"],
  }),
  capability("tooling", "e2e", "E2E", {
    parentKey: "test-harness",
    rootPrefixes: ["e2e/"],
  }),
  capability("tooling", "code-generation", "代码与文档生成", {
    parentKey: "tooling-command-runtime",
    rootFiles: [
      "scripts/generate-action-contract-docs.ts", "scripts/generate-api-agent-guide.ts",
      "scripts/generate-core-ui-surface-contracts.test.ts", "scripts/generate-core-ui-surface-contracts.ts",
      "scripts/generate-doc-editor-qc-templates.ts", "scripts/generate-permission-action-docs.ts",
      "scripts/generate-permission-review-baseline.ts", "scripts/generate-production-agent-docs.ts",
    ],
    rootPrefixes: ["scripts/generate/", "scripts/reference/"],
  }),
  capability("tooling", "tooling-commands", "开发治理命令", {
    kind: "orchestrator",
    parentKey: "tooling-foundation",
    rootDirectChildren: ["scripts/"],
  }),
  capability("tooling", "tooling-command-runtime", "开发命令运行时", {
    kind: "orchestrator",
    parentKey: "tooling-commands",
    rootDirectChildren: ["scripts/"],
  }),
  capability("tooling", "library-maintenance-commands", "资料库维护命令", {
    parentKey: "tooling-command-runtime",
    rootFiles: [
      "scripts/check-library-scan-manifest.ts", "scripts/compact-library-runtime.ts",
      "scripts/compress-library-batch.ts", "scripts/export-library-selection.ts",
      "scripts/import-library-catalog.ts", "scripts/library-scan-smoke.ts",
      "scripts/prepare-library-pilot.ts", "scripts/preview-library-batch.ts",
      "scripts/preview-library-version.ts", "scripts/process-library-pilot.ts",
      "scripts/process-library-version.ts", "scripts/run-library-incremental.ts",
      "scripts/scan-library.ts", "scripts/search-library.ts", "scripts/seed-library-generated-sources.ts",
    ],
  }),
  capability("tooling", "database-verification-commands", "数据库容量与运行验证命令", {
    parentKey: "tooling-command-runtime",
    rootPrefixes: ["scripts/postgresql-"],
  }),
  capability("tooling", "tenant-maintenance-commands", "租户数据维护命令", {
    parentKey: "tooling-command-runtime",
    rootFiles: [
      "scripts/backfill-permission-grant-ledger.ts", "scripts/provision-agent-workforce.mjs",
      "scripts/rehome-docs-editor-content.ts", "scripts/seed-resources-runtime.mjs",
      "scripts/seed-resources.ts", "scripts/sync-external-snapshots.mjs",
      "scripts/sync-finance-group-chart.ts", "scripts/write-resource-manifest.ts",
    ],
  }),
] as const;

function validateSourceCapabilityInterfaceCatalog(
  declarations: readonly SourceCapabilityDeclaration[],
) {
  const declarationIds = new Set(declarations.map((declaration) =>
    `${declaration.moduleKey}/${declaration.key}`));
  const unknownIds = Object.keys(SOURCE_CAPABILITY_INTERFACE_FILES)
    .filter((id) => !declarationIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`[source-code-analysis] Interface catalog has unknown modules: ${unknownIds.join(", ")}`);
  }
}

validateSourceCapabilityInterfaceCatalog(SOURCE_CAPABILITY_DECLARATIONS);

export function matchesCapabilityRule(relativePath: string, rule: SourceCapabilityPathRule) {
  if (rule.kind === "file") return relativePath === rule.path;
  if (rule.kind === "prefix") return relativePath.startsWith(rule.path);
  if (!relativePath.startsWith(rule.path)) return false;
  return !relativePath.slice(rule.path.length).includes("/");
}

const CAPABILITY_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function sourceCapabilityDeclarationId(
  declaration: Pick<SourceCapabilityDeclaration, "moduleKey" | "key">,
) {
  return `${declaration.moduleKey}\0${declaration.key}`;
}

/**
 * Validates an arbitrarily deep product-module tree and returns each node's
 * depth (L2 = 2, L3 = 3, ...). This is deliberately parent-based instead of
 * carrying a fixed level enum, so future L3/L4 nodes use the same contract.
 */
export function validateSourceCapabilityDeclarations(
  declarations: readonly SourceCapabilityDeclaration[],
): ReadonlyMap<string, number> {
  const byId = new Map<string, SourceCapabilityDeclaration>();
  for (const declaration of declarations) {
    if (!CAPABILITY_GOVERNED_MODULE_KEYS.includes(declaration.moduleKey)) {
      throw new Error(`[source-code-analysis] unknown capability module: ${declaration.moduleKey}`);
    }
    if (!CAPABILITY_KEY_PATTERN.test(declaration.key)) {
      throw new Error(`[source-code-analysis] invalid capability key: ${declaration.moduleKey}/${declaration.key}`);
    }
    if (declaration.kind === "entry" && declaration.parentKey !== null) {
      throw new Error(`[source-code-analysis] entry capability must be an L1 boundary: ${declaration.moduleKey}/${declaration.key}`);
    }
    for (const interfaceRule of declaration.interface) {
      const contained = declaration.include.some((includeRule) => {
        if (interfaceRule.kind === "file") return matchesCapabilityRule(interfaceRule.path, includeRule);
        return includeRule.kind === "prefix" && interfaceRule.path.startsWith(includeRule.path);
      });
      if (!contained) {
        throw new Error(
          `[source-code-analysis] capability Interface escapes owned Implementation: ${declaration.moduleKey}/${declaration.key} -> ${interfaceRule.path}`,
        );
      }
    }
    const id = sourceCapabilityDeclarationId(declaration);
    if (byId.has(id)) {
      throw new Error(`[source-code-analysis] duplicate capability declaration: ${declaration.moduleKey}/${declaration.key}`);
    }
    byId.set(id, declaration);
  }
  for (const moduleKey of CAPABILITY_GOVERNED_MODULE_KEYS) {
    const entries = declarations.filter((declaration) =>
      declaration.moduleKey === moduleKey && declaration.kind === "entry");
    if (entries.length > 1) {
      throw new Error(`[source-code-analysis] multiple L1 entry declarations: ${moduleKey}`);
    }
  }

  for (const declaration of declarations) {
    if (declaration.parentKey === null) continue;
    if (declaration.parentKey === declaration.key) {
      throw new Error(`[source-code-analysis] capability cannot parent itself: ${declaration.moduleKey}/${declaration.key}`);
    }
    if (!byId.has(`${declaration.moduleKey}\0${declaration.parentKey}`)) {
      throw new Error(
        `[source-code-analysis] missing capability parent: ${declaration.moduleKey}/${declaration.key} -> ${declaration.parentKey}`,
      );
    }
  }

  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  function depthFor(declaration: SourceCapabilityDeclaration): number {
    const id = sourceCapabilityDeclarationId(declaration);
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) {
      throw new Error(`[source-code-analysis] capability parent cycle: ${declaration.moduleKey}/${declaration.key}`);
    }
    visiting.add(id);
    const depth = declaration.kind === "entry"
      ? 1
      : declaration.parentKey === null
      ? 2
      : depthFor(byId.get(`${declaration.moduleKey}\0${declaration.parentKey}`)!) + 1;
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  }
  for (const declaration of declarations) depthFor(declaration);
  return depths;
}

const SOURCE_CAPABILITY_DEPTHS = validateSourceCapabilityDeclarations(SOURCE_CAPABILITY_DECLARATIONS);

export function sourceCapabilityDepth(
  declaration: Pick<SourceCapabilityDeclaration, "moduleKey" | "key">,
  declarations: readonly SourceCapabilityDeclaration[] = SOURCE_CAPABILITY_DECLARATIONS,
) {
  const depths = declarations === SOURCE_CAPABILITY_DECLARATIONS
    ? SOURCE_CAPABILITY_DEPTHS
    : validateSourceCapabilityDeclarations(declarations);
  const depth = depths.get(sourceCapabilityDeclarationId(declaration));
  if (depth === undefined) {
    throw new Error(`[source-code-analysis] undeclared capability depth: ${declaration.moduleKey}/${declaration.key}`);
  }
  return depth;
}

export function capabilityGovernedModuleForPath(relativePath: string) {
  const owners = sourceModuleDeclarationsForPath(relativePath);
  if (owners.length !== 1) return null;
  const moduleKey = owners[0].key;
  return CAPABILITY_GOVERNED_MODULE_KEYS.includes(moduleKey as CapabilityGovernedModuleKey)
    ? moduleKey as CapabilityGovernedModuleKey
    : null;
}

/**
 * The deepest matching node owns a file. Ancestor and descendant path overlap
 * is intentional; two matching nodes at the same depth remain ambiguous.
 */
export function sourceCapabilityDeclarationsForPath(
  moduleKey: string,
  relativePath: string,
  declarations: readonly SourceCapabilityDeclaration[] = SOURCE_CAPABILITY_DECLARATIONS,
) {
  if (!CAPABILITY_GOVERNED_MODULE_KEYS.includes(moduleKey as CapabilityGovernedModuleKey)) return [];
  const matches = declarations.filter((declaration) =>
    declaration.moduleKey === moduleKey
    && declaration.include.some((rule) => matchesCapabilityRule(relativePath, rule)));
  if (matches.length < 2) return matches;
  const depths = declarations === SOURCE_CAPABILITY_DECLARATIONS
    ? SOURCE_CAPABILITY_DEPTHS
    : validateSourceCapabilityDeclarations(declarations);
  const deepest = Math.max(...matches.map((declaration) =>
    depths.get(sourceCapabilityDeclarationId(declaration)) ?? 0));
  return matches.filter((declaration) =>
    depths.get(sourceCapabilityDeclarationId(declaration)) === deepest);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseCapabilityOwnershipBaseline(parsed: unknown): CapabilityOwnershipBaseline {
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.legacyUnclassifiedFiles)) {
    throw new Error("[source-code-analysis] invalid capability ownership baseline");
  }
  const topLevelKeys = Object.keys(parsed).sort();
  if (topLevelKeys.join("\0") !== ["legacyUnclassifiedFiles", "schemaVersion"].sort().join("\0")) {
    throw new Error("[source-code-analysis] capability ownership baseline has unknown top-level keys");
  }
  const unknownModuleKeys = Object.keys(parsed.legacyUnclassifiedFiles)
    .filter((moduleKey) => !CAPABILITY_GOVERNED_MODULE_KEYS.includes(moduleKey as CapabilityGovernedModuleKey));
  if (unknownModuleKeys.length > 0) {
    throw new Error(
      `[source-code-analysis] capability ownership baseline has unknown modules: ${unknownModuleKeys.sort().join(", ")}`,
    );
  }
  const legacyUnclassifiedFiles: CapabilityOwnershipBaseline["legacyUnclassifiedFiles"] = {};
  for (const moduleKey of CAPABILITY_GOVERNED_MODULE_KEYS) {
    const values = parsed.legacyUnclassifiedFiles[moduleKey];
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
      throw new Error(`[source-code-analysis] invalid capability ownership baseline for ${moduleKey}`);
    }
    if (values.some((value) => !sourceModuleDeclarationsForPath(value)
      .some((declaration) => declaration.key === moduleKey))) {
      throw new Error(`[source-code-analysis] capability baseline path escapes ${moduleKey}`);
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`[source-code-analysis] duplicate capability baseline path for ${moduleKey}`);
    }
    legacyUnclassifiedFiles[moduleKey] = [...values].sort();
  }
  return { schemaVersion: 1, legacyUnclassifiedFiles };
}

export async function readCapabilityOwnershipBaseline(repositoryRoot: string): Promise<CapabilityOwnershipBaseline> {
  return parseCapabilityOwnershipBaseline(JSON.parse(await fs.readFile(
    path.join(repositoryRoot, CAPABILITY_OWNERSHIP_BASELINE_PATH),
    "utf8",
  )) as unknown);
}
