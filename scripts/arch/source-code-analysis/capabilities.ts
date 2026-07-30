import { promises as fs } from "node:fs";
import path from "node:path";

export interface SourceCapabilityPathRule {
  kind: "file" | "prefix";
  path: string;
}

export interface SourceCapabilityDeclaration {
  moduleKey: CapabilityGovernedModuleKey;
  key: string;
  label: string;
  include: readonly SourceCapabilityPathRule[];
}

export const CAPABILITY_GOVERNED_MODULE_KEYS = ["platform", "finance", "work", "hr"] as const;
export type CapabilityGovernedModuleKey = (typeof CAPABILITY_GOVERNED_MODULE_KEYS)[number];

export interface CapabilityOwnershipBaseline {
  schemaVersion: 1;
  legacyUnclassifiedFiles: Partial<Record<CapabilityGovernedModuleKey, string[]>>;
}

export const CAPABILITY_OWNERSHIP_BASELINE_PATH =
  "scripts/arch/source-code-analysis/capability-ownership-baseline.json";

function rules(moduleKey: CapabilityGovernedModuleKey, options: {
  files?: readonly string[];
  prefixes?: readonly string[];
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
  ];
}

function capability(
  moduleKey: CapabilityGovernedModuleKey,
  key: string,
  label: string,
  options: Parameters<typeof rules>[1],
): SourceCapabilityDeclaration {
  return { moduleKey, key, label, include: rules(moduleKey, options) };
}

export const SOURCE_CAPABILITY_DECLARATIONS: readonly SourceCapabilityDeclaration[] = [
  capability("platform", "shell-navigation", "应用壳与导航", {
    files: [
      "effective-module-registry.ts", "mobile-experience.ts", "modules.tsx",
      "portal-preferences.test.ts", "portal-preferences.ts", "view-registry.test.ts", "view-registry.ts",
      "ui/AppShell.tsx", "ui/AppVersionGuard.tsx", "ui/ModuleHome.tsx", "ui/NavLink.tsx",
      "ui/PortalClient.tsx", "ui/app-shell-page.tsx", "ui/portal-page.tsx",
      "ui/portal-preferences.ts", "ui/useDeployUnitNavigation.ts",
      "server/app-version.ts", "server/deploy-unit-runtime.ts", "server/module-home-page.tsx",
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
      "production-batch-number.ts", "route-runtime-labels.test.ts", "route-runtime-labels.ts",
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
      "constants/index.ts", "server/index.ts", "server/workbook-formula-contract.test.ts",
      "server/workbook-formula-contract.ts", "types/index.ts", "ui/index.ts", "tsconfig.json",
    ],
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

  capability("hr", "analysis", "人事分析", {
    files: ["server/analysis.ts"],
    prefixes: ["server/analysis/", "ui/analytics/"],
  }),
  capability("hr", "employment-lifecycle", "员工与雇佣生命周期", {
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
] as const;

function matchesCapabilityRule(relativePath: string, rule: SourceCapabilityPathRule) {
  return rule.kind === "file" ? relativePath === rule.path : relativePath.startsWith(rule.path);
}

export function capabilityGovernedModuleForPath(relativePath: string) {
  return CAPABILITY_GOVERNED_MODULE_KEYS.find((moduleKey) =>
    relativePath.startsWith(`packages/${moduleKey}/`)) ?? null;
}

/** 收集全部候选，调用方必须把 0 个和多个候选分别诊断，不能依赖声明顺序吞掉重叠。 */
export function sourceCapabilityDeclarationsForPath(
  moduleKey: string,
  relativePath: string,
  declarations: readonly SourceCapabilityDeclaration[] = SOURCE_CAPABILITY_DECLARATIONS,
) {
  if (!CAPABILITY_GOVERNED_MODULE_KEYS.includes(moduleKey as CapabilityGovernedModuleKey)) return [];
  if (capabilityGovernedModuleForPath(relativePath) !== moduleKey) return [];
  return declarations.filter((declaration) =>
    declaration.moduleKey === moduleKey
    && declaration.include.some((rule) => matchesCapabilityRule(relativePath, rule)));
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
    const expectedPrefix = `packages/${moduleKey}/`;
    if (values.some((value) => !value.startsWith(expectedPrefix))) {
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
