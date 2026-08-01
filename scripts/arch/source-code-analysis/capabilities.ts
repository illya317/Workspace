import { promises as fs } from "node:fs";
import path from "node:path";

import { SOURCE_CAPABILITY_INTERFACE_FILES } from "./capability-interfaces";
import { sourceModuleDeclarationsForPath } from "./declarations";
import type { SourceModuleKind } from "./module-health-policy";
import {
  OPERATIONS_ARTIFACT_SUPPLY_FILES,
  OPERATIONS_DATA_RELEASE_FILES,
  OPERATIONS_DEPLOYMENT_CUTOVER_FILES,
  OPERATIONS_FOUNDATION_FILES,
  OPERATIONS_RELEASE_CI_FILES,
  OPERATIONS_RUNTIME_DEPENDENCY_FILES,
} from "./operations-capability-file-catalog";

export interface SourceCapabilityPathRule {
  kind: "directChildren" | "file" | "prefix";
  path: string;
}

export interface SourceCapabilityDeclaration {
  moduleKey: CapabilityGovernedModuleKey;
  key: string;
  kind: SourceModuleKind;
  /** Null means the product L1 is the parent. Otherwise this points at another node in the same tree. */
  parentKey: string | null;
  label: string;
  include: readonly SourceCapabilityPathRule[];
  /** Explicit public Interface paths that other branches may import. */
  interface: readonly SourceCapabilityPathRule[];
}

export const CAPABILITY_GOVERNED_MODULE_KEYS = [
  "platform",
  "finance",
  "work",
  "hr",
  "core",
  "data-model",
  "operations",
  "tooling",
] as const;
export type CapabilityGovernedModuleKey = (typeof CAPABILITY_GOVERNED_MODULE_KEYS)[number];

export interface CapabilityOwnershipBaseline {
  schemaVersion: 1;
  legacyUnclassifiedFiles: Partial<Record<CapabilityGovernedModuleKey, string[]>>;
}

export const CAPABILITY_OWNERSHIP_BASELINE_PATH =
  "scripts/arch/source-code-analysis/capability-ownership-baseline.json";

function rules(moduleKey: CapabilityGovernedModuleKey, options: {
  directChildren?: readonly string[];
  files?: readonly string[];
  prefixes?: readonly string[];
  rootDirectChildren?: readonly string[];
  rootFiles?: readonly string[];
  rootPrefixes?: readonly string[];
}): SourceCapabilityPathRule[] {
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

function capability(
  moduleKey: CapabilityGovernedModuleKey,
  key: string,
  label: string,
  options: Parameters<typeof rules>[1] & {
    parentKey?: string | null;
    kind?: SourceModuleKind;
    interfaceFiles?: readonly string[];
    interfacePrefixes?: readonly string[];
  },
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

  capability("finance", "entry", "L1 接入与组合层", {
    kind: "entry",
    rootPrefixes: ["app/(modules)/finance/", "app/api/modules/finance/"],
  }),
  capability("finance", "assets", "资产", {
    prefixes: ["server/assets/", "ui/assets/", "types/assets", "constants/assets", "server/domain/asset-"],
  }),
  capability("finance", "budget", "预算", {
    prefixes: ["server/budget/", "ui/budget/", "types/budget", "constants/budget", "server/domain/budget-"],
  }),
  capability("finance", "close", "关账", {
    prefixes: ["server/close/", "types/close", "server/domain/close-"],
  }),
  capability("finance", "cost", "成本", {
    prefixes: ["server/cost/", "ui/cost/", "types/cost", "constants/cost", "server/domain/cost-"],
  }),
  capability("finance", "ledger", "总账与重分类", {
    prefixes: [
      "server/ledger/", "ui/ledger/", "types/ledger", "constants/ledger",
      "server/domain/ledger-", "server/domain/group-", "server/domain/counterparty-",
      "server/schedules/", "types/auxiliary-reclass", "types/group-account", "types/reclass",
    ],
  }),
  capability("finance", "statements", "报表与合并", {
    prefixes: [
      "server/statements/", "ui/statements/", "types/statements", "constants/statements",
      "server/domain/statement-", "server/domain/consolidation-", "server/group-policy-",
      "types/consolidated-", "types/consolidation-",
      "types/statement-",
    ],
  }),
  capability("finance", "tax", "税务", {
    prefixes: ["server/tax/", "ui/tax/", "types/tax", "constants/tax", "server/domain/tax-"],
  }),
  capability("finance", "treasury", "资金", {
    prefixes: [
      "server/treasury/", "ui/treasury/", "types/treasury", "constants/treasury",
      "server/domain/treasury-", "types/fund-flow",
    ],
  }),
  capability("finance", "analysis", "财务分析", {
    prefixes: [
      "server/analysis/", "ui/analysis/", "server/workspace-analysis-",
      "types/analysis", "constants/analysis",
      "server/domain/operational-analysis-", "types/management-analysis", "types/operational-analysis",
    ],
  }),
  capability("finance", "import", "财务导入", {
    prefixes: ["import/", "server/import/", "server/domain/readable-import-"],
  }),
  capability("finance", "shared-ui", "财务共享界面", {
    files: [
      "ui/formatters.test.ts", "ui/formatters.ts", "ui/workbook-download.test.ts", "ui/workbook-download.ts",
    ],
    prefixes: ["ui/components/", "ui/navigation/"],
  }),
  capability("finance", "shared-contracts", "财务公共契约", {
    files: [
      "README.md", "business-temporal.ts", "index.ts", "module.ts", "package.json",
      "server/domain/shared-validation.ts",
      "constants/index.ts", "server/index.ts", "server/workbook-formula-contract.test.ts",
      "server/workbook-formula-contract.ts", "types/index.ts", "ui/index.ts", "tsconfig.json",
    ],
    interfaceFiles: ["server/domain/shared-validation.ts"],
  }),

  capability("work", "entry", "L1 接入与组合层", {
    kind: "entry",
    rootPrefixes: ["app/(modules)/work/", "app/api/modules/work/"],
  }),
  capability("work", "meetings", "会议", { prefixes: ["server/meetings/", "ui/meetings/"] }),
  capability("work", "projects", "项目", {
    files: ["ui/tabs/ProjectTab.tsx"],
    prefixes: [
      "server/project-", "server/projects.", "server/projects/", "server/domain/project-", "server/work-project-",
      "ui/project/", "ui/tabs/project/",
    ],
  }),
  capability("work", "tasks", "任务与工作项", {
    prefixes: [
      "server/task-", "server/work-task-", "server/work-item-", "server/works.",
      "server/domain/work-completion-", "server/domain/work-item-", "server/domain/work-participant-",
      "ui/works/", "ui/works.",
    ],
  }),
  capability("work", "plans-goals-kpi", "计划、目标与绩效", {
    prefixes: [
      "server/work-plan-", "server/work-plans.", "server/work-okr-", "server/work-kpi-",
      "server/work-kr-", "server/work-period-", "ui/gantt/",
      "server/domain/work-kpi-", "server/domain/work-kr-", "server/domain/work-okr-",
      "server/domain/work-performance-", "server/domain/work-period-", "server/domain/work-plan-",
      "server/domain/work-system-", "server/work-assigned-", "server/work-goal-", "server/work-pilot-",
    ],
  }),
  capability("work", "reporting-analysis", "汇报与分析", {
    files: ["work-report-periods.ts"],
    prefixes: [
      "server/report-", "server/work-report-", "server/workspace-analysis-", "server/domain/work-report-",
      "server/weekly-report-",
      "server/domain/work-reporting-",
    ],
  }),
  capability("work", "collaboration", "协作与责任范围", {
    files: ["server/access.ts"],
    prefixes: [
      "server/business-space-", "server/department-", "server/work-collaboration-",
      "server/work-owner-", "server/work-responsibility-", "server/work-source-",
      "server/work-superior-",
      "server/domain/department-", "server/domain/work-responsibility-",
    ],
  }),
  capability("work", "shared-ui", "工作共享界面", {
    files: ["ui/index.ts"],
    prefixes: ["ui/home/"],
  }),
  capability("work", "shared-contracts", "工作公共契约", {
    files: [
      "business-temporal.ts", "index.ts", "module.ts", "package.json", "server/fk-registry.ts",
      "server/index.ts", "server/schemas.ts", "server/standard-space-seeds.ts",
      "server/workflow-todo-provider.ts", "tsconfig.json",
    ],
    prefixes: ["constants/", "types/", "import/"],
  }),
  capability("work", "mutation-impact", "变更影响传播", {
    files: ["server/work-mutation-impact.ts"],
    prefixes: ["server/work-mutation-impact-", "server/domain/work-mutation-impact-"],
  }),

  capability("hr", "entry", "L1 接入与组合层", {
    kind: "entry",
    rootPrefixes: ["app/(modules)/hr/", "app/api/modules/hr/", "app/api/open/v1/hr/"],
  }),
  capability("hr", "library-export", "人事资料输出", {
    files: ["server/library-source.ts"],
  }),
  capability("hr", "analysis", "人事分析", {
    files: ["server/analysis.ts"],
    prefixes: ["server/analysis/", "ui/analytics/"],
  }),
  capability("hr", "employment-lifecycle", "员工与雇佣生命周期", {
    files: [
      "server/domain/page-draft-validation.test.ts",
      "server/domain/page-draft-validation.ts",
    ],
    prefixes: [
      "employee-", "employment-", "server/agreement-", "server/contract-", "server/contracts.",
      "server/employee-", "server/employees.", "server/employment-", "server/employments.",
      "server/social-insurance-", "ui/profile/",
      "server/domain/contract-", "server/domain/employee-", "server/domain/employment-",
      "server/contracts-capacity.", "server/employments-department-scope.", "server/roster-",
      "server/roster.", "ui/generated/", "utils/contract-", "utils/employment-",
    ],
  }),
  capability("hr", "organization", "组织、部门与岗位", {
    prefixes: [
      "server/department-", "server/departments.", "server/edp-", "server/edps.",
      "server/organization-", "server/position-", "server/positions.", "ui/organization/",
      "ui/tabs/department-position/", "utils/department-",
      "server/domain/department-", "server/domain/organization-", "server/domain/position-",
    ],
  }),
  capability("hr", "performance", "绩效", {
    prefixes: [
      "server/performance-", "server/performance.", "server/performance/",
      "server/domain/performance-", "ui/performance/",
    ],
  }),
  capability("hr", "data-quality", "人事数据质量", {
    files: ["server/audit-entities.ts"],
    prefixes: ["server/data-quality-", "server/data-quality.", "server/domain/audit-", "ui/audit/"],
  }),
  capability("hr", "code-governance", "人事编码治理", {
    files: ["ui/code-helpers.ts"],
    prefixes: ["server/domain/code-governance-", "ui/code/"],
  }),
  capability("hr", "shared-ui", "人事共享界面", {
    files: [
      "ui/HRClient.tsx", "ui/fk-keys.ts", "ui/index.ts", "ui/roster-surface.ts",
      "server/autocomplete-config.ts", "server/autocomplete.ts", "server/hr-tab-list-capacity.test.ts",
      "ui/tabs/DepartmentPositionTab.tsx", "ui/tabs/EditableTable.tsx", "ui/tabs/GenericTableTab.tsx",
      "ui/tabs/generic-table-columns.ts", "ui/tabs/generic-table-export.ts",
    ],
    prefixes: ["ui/components/", "ui/hooks/"],
  }),
  capability("hr", "shared-contracts", "人事公共契约与支撑", {
    files: [
      "README.md", "business-temporal.test.ts", "business-temporal.ts", "index.ts", "module.ts",
      "package.json", "server/field-reference-adapter.ts", "server/field-validation.ts",
      "server/fk-registry.ts", "server/hr-crud.ts", "server/index.ts",
      "server/reference-count-adapter.ts", "server/reference-guards.ts", "server/route-commands.ts",
      "server/schemas.ts", "tsconfig.json", "utils/identity.ts", "utils/index.ts",
    ],
    prefixes: ["constants/", "types/", "import/"],
  }),

  capability("core", "shared-contracts", "核心公共契约", {
    kind: "orchestrator",
    files: [
      "README.md", "action-glyph-contract.ts", "index.ts", "module-contract.ts", "package.json",
      "page-style-preview.ts", "surface-navigation-contract.ts", "tsconfig.json", "ui-registry.ts",
    ],
    interfaceFiles: [
      "action-glyph-contract.ts", "index.ts", "module-contract.ts", "page-style-preview.ts",
      "surface-navigation-contract.ts", "ui-registry.ts",
    ],
  }),
  capability("core", "hooks", "通用交互 Hooks", {
    prefixes: ["hooks/"],
    interfaceFiles: ["hooks/index.ts", "hooks/useScrollToIndexedItem.ts"],
  }),
  capability("core", "period", "期间语义", {
    prefixes: ["period/"],
    interfaceFiles: ["period/index.ts"],
  }),
  capability("core", "routing", "部署单元路由", {
    prefixes: ["routing/"],
    interfaceFiles: ["routing/index.ts"],
  }),
  capability("core", "search", "通用搜索", {
    prefixes: ["search/"],
    interfaceFiles: ["search/index.ts"],
  }),
  capability("core", "ui-surfaces", "核心界面契约", {
    prefixes: ["ui/"],
  }),
  capability("core", "surface-runtime", "UI Surface 运行时", {
    parentKey: "ui-surfaces",
    prefixes: ["ui/"],
    interfaceFiles: [
      "ui/CreateSurface.tsx", "ui/DataSurface.types.ts", "ui/FormSurface.tsx", "ui/InputSurface.tsx",
      "ui/MobileExperienceBoundary.tsx", "ui/NavigationSurface.tsx", "ui/NavigationSurface.types.ts",
      "ui/SurfaceContractTypes.ts", "ui/internal/action/ActionControls.tsx",
      "ui/internal/action/ActionGlyphs.tsx", "ui/internal/action/CreateActionControls.tsx",
      "ui/internal/common/Badge.tsx", "ui/internal/common/CommandButton.tsx",
      "ui/internal/common/DisclosureRecordCard.tsx", "ui/internal/common/DropdownSurface.tsx",
      "ui/internal/common/FloatingPortalSurface.tsx", "ui/internal/common/SplitWorkspaceMasterContext.tsx",
      "ui/internal/common/card-utils.ts", "ui/internal/common/interactionTokens.ts",
      "ui/internal/common/text-overflow.ts", "ui/internal/create/CreateSurfaceAnchorContext.tsx",
      "ui/internal/form/FormStyles.ts", "ui/internal/input/CalendarDateInput.tsx",
      "ui/internal/input/CalendarDatePopover.tsx", "ui/internal/input/FieldShell.tsx",
      "ui/internal/input/InputSurfaceTypes.ts", "ui/internal/input/RemovableTag.tsx",
      "ui/internal/input/adaptive-control-width.ts", "ui/internal/input/field-context.tsx",
      "ui/internal/input/input-surface-choice-renderers.tsx", "ui/internal/page/PageSurface.commands.tsx",
    ],
  }),
  capability("core", "table-filtering", "表格与筛选", {
    parentKey: "surface-runtime",
    files: ["ui/internal/input/FieldValueFilter.tsx", "ui/internal/input/SearchInput.tsx"],
    prefixes: ["ui/internal/data/", "ui/internal/toolbar/"],
  }),
  capability("core", "field-references", "字段引用与选择", {
    parentKey: "surface-runtime",
    files: [
      "ui/NavigationContextSelector.tsx", "ui/SelectorSurface.tsx", "ui/SelectorSurface.types.ts",
      "ui/selector-tree-expansion.ts", "ui/internal/input/FkFieldInput.tsx",
      "ui/internal/input/SearchableOptionInput.tsx", "ui/internal/input/autocomplete-list-styles.ts",
      "ui/internal/input/autocomplete-option-display.ts",
    ],
    prefixes: ["ui/internal/selection/"],
    interfaceFiles: [
      "ui/internal/input/FkFieldInput.tsx", "ui/internal/input/SearchableOptionInput.tsx",
      "ui/internal/selection/SelectionGrid.tsx", "ui/internal/selection/SelectionParts.tsx",
    ],
  }),
  capability("core", "visualization", "可视化", {
    parentKey: "surface-runtime",
    files: ["ui/VisualizationSurface.tsx", "ui/VisualizationSurfaceTypes.ts"],
    prefixes: ["ui/internal/visualization/"],
  }),
  capability("core", "showcase", "核心界面样例组合", {
    kind: "orchestrator",
    prefixes: ["showcase/"],
  }),

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
  capability("tooling", "static-analysis", "静态检查", {
    parentKey: "tooling-foundation",
    rootPrefixes: ["scripts/check/"],
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
