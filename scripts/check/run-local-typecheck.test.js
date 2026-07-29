const assert = require("node:assert/strict");
const test = require("node:test");

const { main, resolveQuickTypecheckPlan } = require("./run-local-typecheck");

const scopes = new Set([
  "app",
  "app-assistant",
  "app-capital-securities",
  "app-docs",
  "app-hr",
  "app-workspace-shell",
  "core",
  "hr",
  "platform",
  "prisma-client",
  "tooling",
]);

test("quick typecheck selects only the directly changed package", () => {
  assert.deepEqual(resolveQuickTypecheckPlan([
    "packages/hr/ui/HRClient.tsx",
    "packages/hr/ui/hr.css",
  ], scopes), {
    changedFiles: ["packages/hr/ui/HRClient.tsx", "packages/hr/ui/hr.css"],
    scopes: ["hr"],
    ignoredFiles: ["packages/hr/ui/hr.css"],
    requiresExplicitFullTypecheck: false,
  });
});

test("quick typecheck maps route shells to their independent app scope", () => {
  assert.deepEqual(resolveQuickTypecheckPlan([
    "app/(modules)/hr/page.tsx",
    "app/api/modules/capitalSecurities/governance/route.ts",
  ], scopes).scopes, ["app-capital-securities", "app-hr"]);
});

test("quick typecheck maps Agent, Docs, and Settings L1 shells to their deploy app scopes", () => {
  assert.deepEqual(resolveQuickTypecheckPlan([
    "app/(modules)/agent/page.tsx",
    "app/(modules)/docs/page.tsx",
    "app/(modules)/settings/page.tsx",
  ], scopes).scopes, ["app-assistant", "app-docs", "app-workspace-shell"]);
});

test("quick typecheck drops package scopes already covered by an app project", () => {
  assert.deepEqual(resolveQuickTypecheckPlan([
    "app/(modules)/hr/page.tsx",
    "packages/hr/ui/HRClient.tsx",
  ], scopes).scopes, ["app-hr"]);
});

test("quick typecheck checks the deepest directly changed shared package", () => {
  assert.deepEqual(resolveQuickTypecheckPlan([
    "packages/core/ui/Button.tsx",
    "packages/platform/auth.ts",
  ], scopes).scopes, ["platform"]);
});

test("quick typecheck refuses to auto-upgrade for compiler and build inputs", () => {
  const plan = resolveQuickTypecheckPlan(["package.json", "packages/hr/ui/HRClient.tsx"], scopes);
  assert.equal(plan.requiresExplicitFullTypecheck, true);
  assert.deepEqual(plan.scopes, []);
  assert.throws(() => main({
    environment: { ...process.env, WORKSPACE_CHANGED_FILES_JSON: '["package.json"]' },
  }), /will not auto-upgrade to the full project graph/);
});

test("quick typecheck skips documentation and presentation-only changes", () => {
  const plan = resolveQuickTypecheckPlan(["docs/engineering/checks.md", "packages/hr/ui/hr.css"], scopes);
  assert.equal(plan.requiresExplicitFullTypecheck, false);
  assert.deepEqual(plan.scopes, []);
});
