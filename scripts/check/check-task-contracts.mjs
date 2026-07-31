export const CHECK_TASK_CONTRACT_VERSION = 2;

const contracts = {
  "action-contract": { roots: ["scripts/check", "packages/platform", "packages/work", "app/api"] },
  "action-registry": { roots: ["scripts/check", "packages", "app/api"] },
  "api-response-format": { roots: ["scripts/check", "app/api", "packages"] },
  "business-action-registry": { roots: ["scripts/check", "packages", "app/api"] },
  "business-code-hardcoding": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "business-identity": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "business-temporal": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "build-next": { roots: ["app", "apps", "packages", "public", "generated", "prisma"], files: ["next.config.ts", "instrumentation.ts"] },
  "company-hardcoding-warning": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "core-ui-contracts": { roots: ["scripts", "packages/core/ui", "packages", "app"], files: ["docs/generated/core-ui-surface-contracts.json"] },
  "data-release": { roots: ["ops/data-release", "scripts/data-release", "prisma/migrations"] },
  "deploy-graph": { roots: ["ops", "apps", "packages/platform", "packages/core"], files: ["package.json"] },
  "deploy-unit-apps": { roots: ["ops", "apps", "packages"], files: ["package.json"] },
  "db-generate": { kind: "prisma", roots: ["prisma", "generated/prisma", "scripts/check"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-migration-changed": { kind: "prisma", roots: ["prisma", "scripts/check", "scripts/ci"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-migration-check": { kind: "prisma", roots: ["prisma", "scripts/check", "scripts/ci"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-path": { kind: "prisma", roots: ["prisma", "scripts/check", "ops"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "db-validate": { kind: "prisma", roots: ["prisma", "scripts/check"], environment: ["DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL"], environmentValueMode: "database-category" },
  "docs-action-contracts": { roots: ["docs", "scripts", "packages", "app/api"] },
  "docs-api-agent-guide": { roots: ["docs", "scripts", "packages", "app/api"] },
  "docs-architecture": { roots: ["docs", "scripts/check", "app", "packages"] },
  "docs-editor-templates": { roots: ["scripts", "packages/docs", "docs"] },
  "docs-permission-actions": { roots: ["docs", "scripts", "packages", "app/api"] },
  "docs-production-agent": { roots: ["docs", "scripts", "packages/agent", "packages/platform", "app/api/agent"] },
  "env": { kind: "environment", roots: ["scripts/check"], files: [".env.example"], environment: ["NEXTAUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "SHADOW_DATABASE_URL", "WORKSPACE_CONFIG_DIR"] },
  "history-policy": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "import-reference": { roots: ["scripts/check", "packages", "app", "prisma"] },
  "lint-changed": { roots: ["scripts/check", "packages", "app", "ops", "prisma"] },
  "lint-full": { roots: ["scripts/check", "packages", "app", "ops", "prisma", "e2e"] },
  "playwright-lifecycle": { roots: ["scripts/check", "e2e"], files: ["playwright.config.ts"] },
  "playwright-processes": { roots: ["scripts/check", "e2e"], files: ["playwright.config.ts"] },
  "schema": { kind: "prisma", roots: ["prisma", "scripts/check", "packages/platform"] },
  "split-quality": { roots: ["scripts/arch", "packages", "app"] },
  "structure-domain": { kind: "domain", roots: ["scripts/arch", "packages", "app/api", "prisma"] },
  "structure-hygiene-warning": { roots: ["scripts/arch", "packages", "app"] },
  "structure-ui": { kind: "ui", roots: ["scripts/arch", "packages", "app"] },
  "surface-boundaries-warning": { kind: "ui", roots: ["scripts/arch", "packages/core/ui", "packages", "app"] },
  "surface-page-adoption-warning": { kind: "ui", roots: ["scripts/arch", "packages", "app"] },
  "surface-visualization-adoption-warning": { kind: "ui", roots: ["scripts/arch", "packages", "app"] },
  "test-focus": { roots: ["scripts/check", "packages", "app", "ops", "e2e"] },
  "typecheck-entrypoints": { roots: ["scripts/check", "ops", ".github"], files: ["package.json"] },
  "typecheck-project-references": { kind: "typescript-config", roots: ["scripts/check", "packages", "apps", "ops"], files: ["tsconfig.json", "tsconfig.base.json", "tsconfig.app.json", "tsconfig.tooling.json", "tsconfig.prisma-client.json", ".github/workflows/ci.yml"] },
  "work-plan-governance": { roots: ["scripts/check", "packages/work", "packages/platform", "prisma"] },
  "workspace-analysis-sources": { roots: ["scripts/check", "packages", "app/api"] },
};

export function checkTaskInputContract(task) {
  if (task.input) return { version: CHECK_TASK_CONTRACT_VERSION, ...task.input };
  if (task.id.startsWith("domain-architecture.")) {
    return { version: CHECK_TASK_CONTRACT_VERSION, kind: "domain", detector: task.id.slice("domain-architecture.".length), roots: ["scripts/arch", "packages", "app/api", "prisma", "generated/prisma"] };
  }
  if (task.id.startsWith("ui-architecture.")) {
    return { version: CHECK_TASK_CONTRACT_VERSION, kind: "ui", detector: task.id.slice("ui-architecture.".length), roots: ["scripts/arch", "packages", "app"] };
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
