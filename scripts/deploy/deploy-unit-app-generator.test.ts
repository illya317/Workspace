import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { generatedDeployUnitAppFiles } from "./deploy-unit-app-generator";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function relativeFiles(unitId: string) {
  return generatedDeployUnitAppFiles(unitId).map((file) => path.relative(repositoryRoot, file.path).replaceAll(path.sep, "/"));
}

test("shell app owns shell/auth/settings routes but not business routes", () => {
  const generated = generatedDeployUnitAppFiles("workspace-shell");
  const files = generated.map((file) => path.relative(repositoryRoot, file.path).replaceAll(path.sep, "/"));
  assert.ok(files.includes("apps/workspace-shell/app/(auth)/login/page.tsx"));
  assert.ok(files.includes("apps/workspace-shell/app/(system)/portal/page.tsx"));
  assert.ok(files.includes("apps/workspace-shell/app/api/auth/me/route.ts"));
  assert.ok(files.includes("apps/workspace-shell/app/api/settings/version/route.ts"));
  assert.equal(files.some((file) => file.includes("/(modules)/finance/")), false);
  const tsconfig = generated.find((file) => file.path.endsWith("/tsconfig.json"));
  assert.ok(tsconfig);
  const references = JSON.parse(tsconfig.content).references.map((reference: { path: string }) => reference.path);
  assert.ok(references.includes("../../packages/core"));
  assert.ok(references.includes("../../packages/platform"));
  assert.ok(references.includes("../../tsconfig.prisma-client.json"));
  assert.equal(references.includes("../../packages/work"), false);
  assert.equal(references.includes("../../packages/hr"), false);
  assert.equal(references.includes("../../packages/finance"), false);
  assert.equal(references.includes("../../packages/library"), false);
  const nextConfig = generated.find((file) => file.path.endsWith("/next.config.ts"));
  assert.match(nextConfig?.content ?? "", /ignoreBuildErrors: true/);
});

test("business app owns its pages and APIs plus common runtime probes", () => {
  const files = relativeFiles("finance");
  assert.ok(files.includes("apps/finance/app/(modules)/finance/page.tsx"));
  assert.ok(files.includes("apps/finance/app/api/modules/finance/ledger/accounts/route.ts"));
  assert.ok(files.includes("apps/finance/app/api/internal/health/route.ts"));
  assert.ok(files.includes("apps/finance/app/api/settings/version/route.ts"));
  assert.ok(files.includes("apps/finance/app/layout.tsx"));
  assert.equal(files.some((file) => file.includes("/(modules)/work/")), false);
});

test("only the generated Work app starts the active-slot-fenced project notification scheduler", () => {
  const workInstrumentation = generatedDeployUnitAppFiles("work")
    .find((file) => file.path.endsWith("/instrumentation.ts"));
  const financeInstrumentation = generatedDeployUnitAppFiles("finance")
    .find((file) => file.path.endsWith("/instrumentation.ts"));
  assert.match(workInstrumentation?.content ?? "", /startProjectNotificationScheduler/);
  assert.doesNotMatch(financeInstrumentation?.content ?? "", /startProjectNotificationScheduler/);
});

test("Library app excludes repository sources from dynamic runtime storage traces", () => {
  const libraryConfig = generatedDeployUnitAppFiles("library")
    .find((file) => file.path.endsWith("/next.config.ts"));
  const financeConfig = generatedDeployUnitAppFiles("finance")
    .find((file) => file.path.endsWith("/next.config.ts"));
  assert.match(libraryConfig?.content ?? "", /outputFileTracingExcludes/);
  assert.match(libraryConfig?.content ?? "", /packages\/\*\*\/\*/);
  assert.doesNotMatch(financeConfig?.content ?? "", /outputFileTracingExcludes/);
});
