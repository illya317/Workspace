const assert = require("node:assert/strict");
const test = require("node:test");
const { hasModuleHomePage, hasRouteAccessGate } = require("./module-page-gate-detector");

const authImport = 'import { requireRouteAccess, requireRouteActionAccess } from "@workspace/platform/server/auth";';

function page(body) {
  return `${authImport}\nexport default async function Page() {\n${body}\n}`;
}

test("accepts awaited imported route action access in the default page execution", () => {
  assert.equal(hasRouteAccessGate(page('const user = await requireRouteActionAccess("/agent/config", "read");\nreturn user;'), "/agent/config"), true);
  assert.equal(hasRouteAccessGate(page('const user = await requireRouteActionAccess("/agent/usage", "audit");\nreturn user;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate('import { requireRouteActionAccess as requireAgentAccess } from "@workspace/platform/server/auth";\nexport default async function Page() { return requireAgentAccess("/agent/config", "read"); }', "/agent/config"), true);
});

test("rejects comment, string, local-function, missing-import and bogus-action decoys", () => {
  const call = 'requireRouteActionAccess("/agent/config", "read")';
  assert.equal(hasRouteAccessGate(`// ${call}`, "/agent/config"), false);
  assert.equal(hasRouteAccessGate(`const decoy = '${call}'`, "/agent/config"), false);
  assert.equal(hasRouteAccessGate(`function requireRouteActionAccess() {}\nexport default async function Page() { return ${call}; }`, "/agent/config"), false);
  assert.equal(hasRouteAccessGate(`export default async function Page() { return ${call}; }`, "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('return requireRouteActionAccess("/agent/config", "bogus");'), "/agent/config"), false);
});

test("rejects ignored, never-called, and conditional imported guard calls", () => {
  assert.equal(hasRouteAccessGate(page('requireRouteActionAccess("/agent/config", "read");\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('async function neverCalled() { await requireRouteActionAccess("/agent/config", "read"); }\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('if (false) await requireRouteActionAccess("/agent/config", "read");\nreturn null;'), "/agent/config"), false);
});

test("rejects swallowed or raced guard promises and imported-binding shadows", () => {
  assert.equal(hasRouteAccessGate(page('try { await requireRouteAccess("/agent/config"); } catch {}\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('await Promise.allSettled([requireRouteAccess("/agent/config")]);\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('await Promise.race([requireRouteAccess("/agent/config"), Promise.resolve()]);\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('await requireRouteAccess("/agent/config").catch(() => null);\nreturn null;'), "/agent/config"), false);
  assert.equal(hasRouteAccessGate(page('const requireRouteAccess = async () => null;\nawait requireRouteAccess("/agent/config");\nreturn null;'), "/agent/config"), false);
});

test("keeps awaited route access and direct protected-page exports", () => {
  assert.equal(hasRouteAccessGate(page('await requireRouteAccess("/agent/config");\nreturn null;'), "/agent/config"), true);
  assert.equal(hasRouteAccessGate('import { createProtectedModulePage } from "@workspace/platform/ui/protected-page";\nexport default createProtectedModulePage({ route: "/agent/config" })', "/agent/config"), true);
});

test("requires the real ModuleHomePage import on the default return path", () => {
  assert.equal(hasModuleHomePage('import ModuleHomePage from "@workspace/platform/ui/ModuleHomePage";\nexport default function Page() { return <ModuleHomePage moduleKey="agent" />; }', "agent"), true);
  assert.equal(hasModuleHomePage('const fake = `<ModuleHomePage moduleKey="agent" />`', "agent"), false);
  assert.equal(hasModuleHomePage('function ModuleHomePage() {}\nexport default function Page() { return <ModuleHomePage moduleKey="agent" />; }', "agent"), false);
});
