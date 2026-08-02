export const CHECK_TASK_CONTRACT_VERSION = 3;

const domainDetectorContracts = {
  "scan": { file: "scripts/arch/scan.ts", roots: ["packages", "app/api", "prisma", "generated/prisma"] },
  "deps": { file: "scripts/arch/deps.ts", roots: ["packages", "app/api"] },
  "modules": {
    file: "scripts/arch/modules.ts",
    patterns: ["^packages/[^/]+/module\\.ts$", "^app/\\(modules\\)/[^/]+/(?:ARCHITECTURE|MODULE)\\.md$"],
  },
  "open-api": { file: "scripts/arch/open-api.ts", roots: ["app/api/open"] },
  "app-route-hierarchy": { file: "scripts/arch/app-route-hierarchy.ts", roots: ["app"] },
  "split-priority": { file: "scripts/arch/split-priority.ts", roots: ["packages", "app/api"] },
  "domain-validation": {
    file: "scripts/arch/domain-validation.ts",
    roots: ["app/api"],
    patterns: ["^packages/[^/]+/server/"],
  },
  "finance-workbook-formulas": { file: "scripts/arch/finance-workbook-formula-gate.ts", owners: ["finance"] },
  "auth": { file: "scripts/arch/auth.ts", roots: ["app/api/auth", "app/api/internal", "app/api/open"] },
};

const uiDetectorFiles = {
  "modal-governance": "scripts/arch/modal-governance.ts",
  "table-row-interaction": "scripts/arch/table-row-interaction.ts",
  "create-surface-entry": "scripts/arch/create-surface-entry.ts",
  "field-layout-debt": "scripts/arch/field-layout.ts",
  "form-surface-actions": "scripts/arch/form-surface-actions.ts",
  "feedback-api": "scripts/arch/feedback-api.ts",
  "input-surface-adoption": "scripts/arch/input-surface-adoption.ts",
  "page-surface-directory": "scripts/arch/page-surface-directory.ts",
  "page-surface-adoption": "scripts/arch/surface-page-adoption.ts",
  "surface-raw-content": "scripts/arch/surface-raw-content.ts",
  "surface-declare-boundaries": "scripts/arch/surface-boundaries.ts",
  "ui-helper-purity": "scripts/arch/ui-helper-purity.ts",
  "body-command-renderer": "scripts/arch/body-command-renderer.ts",
  "action-runtime-ui": "scripts/arch/action-runtime-ui.ts",
  "core-ui-guard": "scripts/arch/core-ui-guard.ts",
  "core-ui-registry": "scripts/arch/core-ui-registry.ts",
};

const contracts = {
  "action-contract": {
    detectors: ["scripts/check/check-action-contracts.ts"],
    owners: ["work"],
    roots: ["app/api/modules/work"],
    files: ["packages/platform/action-contract-registry.ts", "packages/platform/business-action-registry.ts"],
  },
  "action-registry": { detectors: ["scripts/check/check-action-registry.ts"] },
  "api-response-format": {
    detectors: ["scripts/check/check-api-response-format.js"],
    roots: ["app/api"],
    files: ["packages/platform/server/api.ts"],
  },
  "business-action-registry": {
    detectors: ["scripts/check/check-business-action-registry.ts"],
    roots: ["app/api/modules"],
  },
  "business-code-hardcoding": {
    detectors: ["scripts/check/check-business-code.mjs", "scripts/check/check-business-code-hardcoding.mjs", "scripts/check/check-business-code-registry.ts"],
    files: ["scripts/check/baselines/business-code-hardcoding.json", "docs/generated/business-code-registry.md", "app/api/settings/admin/system-config/schema.ts"],
    roots: ["app", "packages"],
    patterns: ["^scripts/(?!check/)"],
  },
  "business-identity": {
    detectors: ["scripts/check/check-business-identity-boundary.js"],
    roots: [
      "app/(modules)",
      "app/api/modules",
      "packages/finance",
      "packages/hr",
      "packages/production",
      "packages/work",
      "packages/platform/server/audit-log.ts",
      "packages/platform/server/business-space-natural-users.ts",
      "packages/platform/server/business-space-permissions.ts",
      "packages/docs/server/permissions.ts",
      "packages/platform/server/fk-search.ts",
      "packages/platform/server/history.ts",
      "packages/platform/server/notifications.ts",
      "packages/platform/server/space-registry.ts",
    ],
  },
  "business-temporal": {
    detectors: ["scripts/check/check-business-temporal-registry.ts", "scripts/arch/business-temporal-write-seam.ts"],
    owners: ["administration", "capital-securities", "external", "hr", "work"],
    roots: ["prisma/models"],
  },
  "build-next": { roots: ["app", "apps", "packages", "public", "generated", "prisma"], files: ["next.config.ts", "instrumentation.ts"] },
  "company-hardcoding-warning": { detectors: ["scripts/check/check-company-hardcoding.js"], roots: ["packages", "app", "prisma"], files: ["scripts/check/company-hardcoding-baseline.json"], environment: ["WORKSPACE_CONFIG_DIR"] },
  "core-ui-contracts": { detectors: ["scripts/generate-core-ui-surface-contracts.ts"], roots: ["packages/core/ui"], files: ["docs/generated/core-ui-surface-contracts.json", "tsconfig.base.json"] },
  "data-release": { roots: ["ops/data-release", "scripts/data-release", "prisma/migrations"] },
  "deploy-graph": { roots: ["ops", "apps", "packages/platform", "packages/core"], files: ["package.json"] },
  "deploy-unit-apps": { roots: ["app", "apps", "packages", "scripts/deploy"], files: ["package.json", "scripts/testing/module-impact-map.json"] },
  "db-generate": { kind: "prisma", detectors: ["scripts/check/normalize-generated-prisma.js"], roots: ["prisma", "generated/prisma"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-migration-changed": { kind: "prisma", detectors: ["scripts/check/run-prisma-migrations-changed.js"], roots: ["prisma", "scripts/ci"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-migration-check": { kind: "prisma", detectors: ["scripts/check/check-prisma-migrations.js"], roots: ["prisma", "scripts/ci"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-path": { kind: "prisma", detectors: ["scripts/check/check-database-paths.js"], roots: ["prisma", "ops"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-validate": { kind: "prisma", roots: ["prisma"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "domain-changed": { kind: "domain", detectors: ["scripts/check/run-domain-validation-changed.js"], roots: ["app/api"], patterns: ["^packages/[^/]+/server/", "^scripts/arch/domain-validation"] },
  "docs-action-contracts": {
    detectors: ["scripts/generate-action-contract-docs.ts"],
    roots: ["docs/generated"],
  },
  "docs-api-agent-guide": {
    detectors: ["scripts/generate-api-agent-guide.ts"],
    roots: ["docs/generated", "app/api/agent"],
  },
  "docs-architecture": {
    detectors: ["scripts/check/check-architecture-docs.js"],
    roots: ["docs"],
    patterns: ["(?:^|/)(?:ARCHITECTURE|MODULE|README)\\.md$"],
  },
  "docs-editor-templates": { detectors: ["scripts/check/check-docs-editor-official-templates.js"], roots: ["packages/docs", "docs"] },
  "docs-permission-actions": {
    detectors: ["scripts/generate-permission-action-docs.ts"],
    roots: ["docs/generated"],
  },
  "docs-production-agent": { detectors: ["scripts/generate-production-agent-docs.ts"], roots: ["docs", "packages/agent", "packages/platform", "app/api/agent"] },
  "env": { kind: "environment", detectors: ["scripts/check/check-env.js"], files: [".env.example"], environment: ["NEXTAUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "WORKSPACE_CONFIG_DIR"] },
  "history-policy": {
    detectors: ["scripts/check/check-history-policy-registry.ts"],
    owners: ["administration", "capital-securities", "external", "finance", "hr", "inventory", "production", "work"],
    roots: ["prisma/models"],
  },
  "import-reference": { detectors: ["scripts/check/check-import-reference-governance.mjs"], roots: ["prisma/models"], files: ["ops/data-release-reference-contracts.mjs", "ops/data-release-handlers.mjs", "scripts/check/import-reference-legacy-baseline.json"] },
  "lint-changed": { detectors: ["scripts/check/run-eslint-changed.js"], roots: ["packages", "app", "ops", "prisma"], files: ["eslint.config.mjs"] },
  "lint-full": { roots: ["packages", "app", "ops", "prisma", "e2e"], files: ["eslint.config.mjs"] },
  "playwright-lifecycle": { detectors: ["scripts/check/check-playwright-lifecycle.ts"], roots: ["e2e"], files: ["playwright.config.ts"] },
  "playwright-processes": { detectors: ["scripts/check/check-playwright-processes.ts"], roots: ["e2e"], files: ["playwright.config.ts"] },
  "schema": { kind: "prisma", detectors: ["scripts/check/check-schema-governance.js"], roots: ["prisma", "packages/platform"] },
  "shell-errexit-policy": {
    detectors: ["scripts/check/check-shell-errexit-policy.mjs"],
    files: ["scripts/check/shell-errexit-policy.json"],
    patterns: ["^(?!scripts/check/shell-errexit-policy\\.json$).+"],
  },
  "split-quality": { detectors: ["scripts/check/check-split-quality.js"], roots: ["scripts/arch", "packages", "app"] },
  "structure-domain": { kind: "domain", detectors: ["scripts/arch/structure-enforce.ts"], roots: ["packages", "app"] },
  "structure-hygiene-warning": {
    detectors: ["scripts/arch/structure-enforce.ts"],
    patterns: [
      "^app/\\(modules\\)/",
      "^packages/(?:administration|capital-securities|external|finance|hr|library|production|work)/ui/",
      "^packages/core/ui/",
    ],
  },
  "structure-ui": { kind: "ui", detectors: ["scripts/arch/structure-enforce.ts"], roots: ["packages", "app"] },
  "surface-boundaries-warning": { kind: "ui", detectors: ["scripts/arch/surface-boundaries.ts"], roots: ["packages", "app"] },
  "surface-page-adoption-warning": { kind: "ui", detectors: ["scripts/arch/surface-page-adoption.ts"], roots: ["packages", "app"] },
  "surface-visualization-adoption-warning": { kind: "ui", detectors: ["scripts/arch/surface-visualization-adoption.ts"], roots: ["packages", "app"] },
  "test-focus": {
    detectors: ["scripts/ci/check-test-focus.mjs"],
    patterns: ["(?:^|/)[^/]+\\.(?:spec|test)\\.[cm]?[jt]sx?$"],
  },
  "typecheck-entrypoints": { detectors: ["scripts/check/check-typecheck-entrypoints.js"], roots: ["ops"], files: ["package.json", ".cnb.yml"] },
  "typecheck-full": {
    roots: ["app", "apps", "generated", "ops", "packages", "prisma", "scripts"],
    files: ["package.json", "tsconfig.json", "tsconfig.base.json", "tsconfig.app.json", "tsconfig.prisma-client.json", "tsconfig.tooling.json"],
  },
  "typecheck-project-references": {
    kind: "typescript-config",
    detectors: ["scripts/check/check-typecheck-project-references.js"],
    patterns: ["^packages/[^/]+/tsconfig\\.json$", "^apps/[^/]+/tsconfig\\.json$"],
    inventoryPatterns: ["^(?!scripts/migrate/sqlite-legacy/).*\\.(?:[mc]?ts|tsx)$"],
    files: ["tsconfig.json", "tsconfig.base.json", "tsconfig.app.json", "tsconfig.tooling.json", "tsconfig.prisma-client.json", ".cnb.yml", ".cnb/tag_deploy.yml", "next.config.ts", "dependency-cruiser.config.cjs", "ops/cnb-ci-cache.Dockerfile", "ops/image.Dockerfile", "ops/deploy-image.sh", "ops/rollback-image.sh"],
  },
  "work-plan-governance": {
    detectors: ["scripts/check/check-work-plan-governance.ts"],
    owners: ["work"],
    roots: ["prisma/models"],
  },
  "workspace-analysis-sources": {
    detectors: ["scripts/check/check-workspace-analysis-source-coverage.ts"],
    owners: ["administration", "capital-securities", "external", "finance", "hr", "inventory", "library", "production", "work"],
    roots: ["app/api/modules"],
  },
};

export function checkTaskInputContract(task) {
  if (task.input) return { version: CHECK_TASK_CONTRACT_VERSION, ...task.input };
  if (task.id.startsWith("domain-architecture.")) {
    const detector = task.id.slice("domain-architecture.".length);
    const detectorContract = domainDetectorContracts[detector];
    if (!detectorContract) throw new Error(`unknown Domain task input detector: ${detector}`);
    return {
      version: CHECK_TASK_CONTRACT_VERSION,
      kind: "domain",
      detector,
      detectors: [detectorContract.file],
      files: ["scripts/arch/domain-gate.ts", "scripts/arch/gate-check-contracts.mjs"],
      ...detectorContract,
      commandClosure: false,
    };
  }
  if (task.id.startsWith("ui-architecture.")) {
    const detector = task.id.slice("ui-architecture.".length);
    const detectorFile = uiDetectorFiles[detector];
    if (!detectorFile) throw new Error(`unknown UI task input detector: ${detector}`);
    return {
      version: CHECK_TASK_CONTRACT_VERSION,
      kind: "ui",
      detector,
      detectors: [detectorFile],
      files: ["scripts/arch/ui-gate.ts", "scripts/arch/gate-check-contracts.mjs"],
      roots: detector.startsWith("core-ui-") ? ["packages/core/ui"] : ["packages", "app"],
      commandClosure: false,
    };
  }
  if (task.id.startsWith("test-node.")) {
    return { version: CHECK_TASK_CONTRACT_VERSION, kind: "node-test-shard", shard: task.shard, testFiles: task.testFiles };
  }
  if (task.id.startsWith("typecheck.")) {
    return { version: CHECK_TASK_CONTRACT_VERSION, kind: "typescript-project", project: task.project };
  }
  const contract = contracts[task.id];
  if (!contract) throw new Error(`check task ${task.id} has no input contract`);
  return { version: CHECK_TASK_CONTRACT_VERSION, kind: "files", ...contract };
}

export function declaredCheckTaskKeys() {
  return Object.keys(contracts).sort();
}
