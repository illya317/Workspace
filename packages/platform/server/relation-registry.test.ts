import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  createRelationCatalog,
  currentEmploymentDateWhere,
  currentOpenEndedDateWhere,
  employmentIsActiveOnDate,
  searchFkOptions,
  validateFkValue,
  type FkSearchInput,
  type SelectorRelationDefinition,
} from "./relation-registry";
import { workspaceBusinessDate } from "./business-date";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

function selectorDefinition(
  key: string,
  overrides: Partial<SelectorRelationDefinition> = {},
): SelectorRelationDefinition {
  return {
    key,
    scope: "test",
    usage: "selector",
    semantics: "reference",
    physical: { sourceModel: "Source", sourceFields: ["targetId"], targetModel: "Target", targetFields: ["id"] },
    lifecycle: { targetDelete: null, targetArchive: null, targetRestore: null, sourceRelationChange: null },
    source: { entity: "Source", field: "targetId" },
    target: { entity: "Target", label: "目标" },
    nullable: true,
    permission: { resourceKey: "test", action: "read" },
    search: async () => [],
    resolve: async (id) => ({ id, label: `Target ${id}`, lifecycleStatus: "active" }),
    ...overrides,
  };
}

test("Relation Catalog keeps deterministic selector lookup semantics", () => {
  const catalog = createRelationCatalog([
    selectorDefinition("z.target"),
    selectorDefinition("a.target"),
  ]);
  assert.deepEqual(catalog.keys(), ["a.target", "z.target"]);
  assert.equal(catalog.require("a.target").target.entity, "Target");
  assert.throws(() => catalog.require("missing"), /未注册 Relation/);
  assert.throws(() => createRelationCatalog([
    selectorDefinition("duplicate"),
    selectorDefinition("duplicate"),
  ]), /重复注册 Relation/);
});

test("selector search still delegates lifecycle, user, and query params to the adapter", async () => {
  let received: FkSearchInput | undefined;
  const catalog = createRelationCatalog([selectorDefinition("test.target", {
    defaultLifecycleScope: "all",
    search: async (input) => {
      received = input;
      return [{ id: 7, name: "Target 7" }];
    },
  })]);

  const options = await searchFkOptions(catalog, {
    fkKey: "test.target",
    keyword: "target",
    userId: 3,
    params: { scopeId: "9" },
  });
  assert.deepEqual(options, [{ id: 7, name: "Target 7" }]);
  assert.deepEqual(received, {
    keyword: "target",
    lifecycleScope: "all",
    userId: 3,
    params: { scopeId: "9" },
  });
});

test("selector validation preserves nullable and lifecycle behavior", async () => {
  const catalog = createRelationCatalog([selectorDefinition("test.target", {
    resolve: async (id) => ({ id, label: `Target ${id}`, lifecycleStatus: id === 8 ? "archived" : "active" }),
  })]);

  assert.deepEqual(await validateFkValue(catalog, { fkKey: "test.target", value: null }), {
    ok: true,
    value: null,
    target: null,
  });
  assert.deepEqual(await validateFkValue(catalog, { fkKey: "test.target", value: "7" }), {
    ok: true,
    value: 7,
    target: { id: 7, label: "Target 7", lifecycleStatus: "active" },
  });
  assert.deepEqual(await validateFkValue(catalog, { fkKey: "test.target", value: 8 }), {
    ok: false,
    error: "目标已归档或不再现用，不能选择",
    status: 400,
  });
});

test("effective-dated relation filters honor both starts and inclusive ends", () => {
  const at = new Date("2026-07-26T04:00:00.000Z");
  const date = workspaceBusinessDate(at);
  assert.deepEqual(currentOpenEndedDateWhere({ employeeId: 7 }, at), {
    employeeId: 7,
    AND: [
      { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: date } }] },
      { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: date } }] },
    ],
  });
});

test("employment activity uses dates and only falls back to isActive for undated legacy rows", () => {
  const at = new Date("2026-07-26T04:00:00.000Z");
  const date = workspaceBusinessDate(at);
  assert.deepEqual(currentEmploymentDateWhere({}, at).AND, [
    { OR: [{ joinDate: null }, { joinDate: "" }, { joinDate: { lte: date } }] },
    { OR: [{ leaveDate: null }, { leaveDate: "" }, { leaveDate: { gte: date } }] },
    {
      OR: [
        { AND: [{ joinDate: { not: null } }, { joinDate: { not: "" } }] },
        { AND: [{ leaveDate: { not: null } }, { leaveDate: { not: "" } }] },
        { isActive: true },
      ],
    },
  ]);
  assert.equal(employmentIsActiveOnDate({ isActive: false, joinDate: "2026-08-01", leaveDate: null }, date), false);
  assert.equal(employmentIsActiveOnDate({ isActive: false, joinDate: "2026-01-01", leaveDate: "2026-08-01" }, date), true);
  assert.equal(employmentIsActiveOnDate({ isActive: false, joinDate: null, leaveDate: null }, date), false);
  assert.equal(employmentIsActiveOnDate({ isActive: true, joinDate: "not-a-date", leaveDate: null }, date), false);
});
