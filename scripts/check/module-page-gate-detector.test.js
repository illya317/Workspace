const assert = require("node:assert/strict");
const test = require("node:test");
const { hasModuleHomePage, hasRouteAccessGate } = require("./module-page-gate-detector");

const authImport = 'import { requireRouteAccess, requireRouteActionAccess } from "@workspace/platform/server/auth";';

function page(body) {
  return `${authImport}\nexport default async function Page() {\n${body}\n}`;
}

test("accepts awaited imported route action access in the default page execution", () => {
  assert.equal(hasRouteAccessGate(page('const user = await requireRouteActionAccess("/hr/roster", "read");\nreturn user;'), "/hr/roster"), true);
  assert.equal(hasRouteAccessGate(page('const user = await requireRouteActionAccess("/finance/ledger", "audit");\nreturn user;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate('import { requireRouteActionAccess as requireHrAccess } from "@workspace/platform/server/auth";\nexport default async function Page() { return requireHrAccess("/hr/roster", "read"); }', "/hr/roster"), true);
});

test("rejects comment, string, local-function, missing-import and bogus-action decoys", () => {
  const call = 'requireRouteActionAccess("/hr/roster", "read")';
  assert.equal(hasRouteAccessGate(`// ${call}`, "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(`const decoy = '${call}'`, "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(`function requireRouteActionAccess() {}\nexport default async function Page() { return ${call}; }`, "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(`export default async function Page() { return ${call}; }`, "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('return requireRouteActionAccess("/hr/roster", "bogus");'), "/hr/roster"), false);
});

test("rejects ignored, never-called, and conditional imported guard calls", () => {
  assert.equal(hasRouteAccessGate(page('requireRouteActionAccess("/hr/roster", "read");\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('async function neverCalled() { await requireRouteActionAccess("/hr/roster", "read"); }\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('if (false) await requireRouteActionAccess("/hr/roster", "read");\nreturn null;'), "/hr/roster"), false);
});

test("rejects swallowed or raced guard promises and imported-binding shadows", () => {
  assert.equal(hasRouteAccessGate(page('try { await requireRouteAccess("/hr/roster"); } catch {}\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('await Promise.allSettled([requireRouteAccess("/hr/roster")]);\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('await Promise.race([requireRouteAccess("/hr/roster"), Promise.resolve()]);\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('await requireRouteAccess("/hr/roster").catch(() => null);\nreturn null;'), "/hr/roster"), false);
  assert.equal(hasRouteAccessGate(page('const requireRouteAccess = async () => null;\nawait requireRouteAccess("/hr/roster");\nreturn null;'), "/hr/roster"), false);
});

test("keeps awaited route access and direct protected-page exports", () => {
  assert.equal(hasRouteAccessGate(page('await requireRouteAccess("/hr/roster");\nreturn null;'), "/hr/roster"), true);
  assert.equal(hasRouteAccessGate('import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";\nexport default createProtectedModulePage({ route: "/hr/roster" })', "/hr/roster"), true);
});

test("requires the real ModuleHomePage import on the default return path", () => {
  assert.equal(hasModuleHomePage('import ModuleHomePage from "@workspace/platform/ui/ModuleHomePage";\nexport default function Page() { return <ModuleHomePage moduleKey="hr" />; }', "hr"), true);
  assert.equal(hasModuleHomePage('const fake = `<ModuleHomePage moduleKey="hr" />`', "hr"), false);
  assert.equal(hasModuleHomePage('function ModuleHomePage() {}\nexport default function Page() { return <ModuleHomePage moduleKey="hr" />; }', "hr"), false);
});
