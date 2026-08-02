import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { exports: {} } as never);

const {
  buildPersonalApiCatalog,
  registerPersonalApiDocumentationReference,
} = await import("./server/personal-api-catalog");
const { getApiContracts } = await import("./api-registry");
const { listBusinessActionRegistrations } = await import("./business-action-registry");

const documentation = {
  uiPath: "/docs/company",
  catalogPath: "/api/modules/docs/company/documents",
  sectionPathTemplate: "/api/modules/docs/company/documents/:documentKey?section=:sectionKey",
  searchPathTemplate: "/api/modules/docs/company/documents/:documentKey?q=:query",
  permissionQueryPath: "/api/modules/docs/company/permission-actions",
  guidance: "Fetch the document catalog first.",
};

test("personal API catalog exposes normal business APIs without depending on the Agent endpoint", (t) => {
  const unregister = registerPersonalApiDocumentationReference(documentation);
  t.after(unregister);
  const catalog = buildPersonalApiCatalog();

  assert.equal(catalog.version, 3);
  assert.equal(catalog.authentication.header, "X-API-Key");
  assert.match(catalog.authentication.embeddedDelegation, /short-lived exact-request delegation/);
  assert.ok(catalog.documentation);
  assert.equal(catalog.documentation.catalogPath, "/api/modules/docs/company/documents");
  assert.match(catalog.documentation.guidance, /catalog first/i);
  assert.equal(catalog.contracts.every((contract) => contract.pathPrefix.startsWith("/api/modules/")), true);
  assert.equal(catalog.mutations.every((operation) => operation.path.startsWith("/api/modules/")), true);
  assert.equal(catalog.contracts.some((contract) => (
    contract.pathPrefix === "/api/modules/finance/cost/operational-analytics/spaces"
    && contract.method === "POST"
  )), true);
  assert.equal(catalog.mutations.some((operation) => (
    operation.key === "finance.operationalAnalytics.template.draft.create"
    && operation.method === "POST"
    && operation.path.endsWith("/:targetId/templates")
  )), true);
  assert.equal(catalog.mutations.some((operation) => (
    operation.key === "finance.operationalAnalytics.template.draft.update"
    && operation.method === "PUT"
    && operation.path.endsWith("/:templateId")
  )), true);
  unregister();
  assert.equal(buildPersonalApiCatalog().documentation, null);
});

test("equal documentation registrations remain active until every lease is released", (t) => {
  const first = registerPersonalApiDocumentationReference(documentation);
  const second = registerPersonalApiDocumentationReference({ ...documentation });
  t.after(first);
  t.after(second);

  first();
  first();
  assert.deepEqual(buildPersonalApiCatalog().documentation, documentation);
  assert.throws(
    () => registerPersonalApiDocumentationReference({ ...documentation, catalogPath: "/conflict" }),
    /already registered/,
  );
  second();
  assert.equal(buildPersonalApiCatalog().documentation, null);

  const third = registerPersonalApiDocumentationReference(documentation);
  const fourth = registerPersonalApiDocumentationReference({ ...documentation });
  t.after(third);
  t.after(fourth);
  fourth();
  assert.deepEqual(buildPersonalApiCatalog().documentation, documentation);
  third();
  assert.equal(buildPersonalApiCatalog().documentation, null);
});

test("personal API catalog has no owner-specific documentation routes without composition input", () => {
  assert.equal(buildPersonalApiCatalog().documentation, null);
});

test("personal API catalog is fully registry-derived and carries no domain workflow Harness", (t) => {
  const unregister = registerPersonalApiDocumentationReference(documentation);
  t.after(unregister);
  const catalog = buildPersonalApiCatalog();
  assert.equal("workflows" in catalog, false);
  assert.equal(JSON.stringify(catalog).includes("LegacyHarness"), false);
  const registeredContractKeys = getApiContracts()
    .filter((contract) => contract.apiKind === "business"
      && contract.access === "protected"
      && contract.pathPrefix.startsWith("/api/modules/"))
    .map((contract) => contract.key)
    .sort();
  assert.deepEqual(catalog.contracts.map((contract) => contract.key).sort(), registeredContractKeys);

  const registeredMutationKeys = new Set(listBusinessActionRegistrations()
    .filter((action) => action.settingsVisibility !== "runtime_only")
    .flatMap((action) => (action.apiRoutes ?? [])
      .filter((route) => route.path.startsWith("/api/modules/"))
      .map((route) => `${action.key}:${route.method}:${route.path}`)));
  assert.deepEqual(
    new Set(catalog.mutations.map((mutation) => `${mutation.key}:${mutation.method}:${mutation.path}`)),
    registeredMutationKeys,
  );
});
