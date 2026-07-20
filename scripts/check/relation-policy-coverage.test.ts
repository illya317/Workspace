import assert from "node:assert/strict";
import test from "node:test";
import type { RelationDefinition, RelationLifecyclePolicies } from "../../packages/platform/server/relation-registry";
import { listRelationAdapterCapabilitiesFromSource } from "./relation-adapter-capabilities";
import {
  buildRelationCoverageReport,
  evaluateRelationCoverageRatchets,
  listPhysicalRelations,
} from "./relation-policy-coverage";

const COMPLETE_BLOCK_LIFECYCLE: RelationLifecyclePolicies = {
  targetDelete: "block",
  targetArchive: "block",
  targetRestore: "retain",
  sourceRelationChange: "retain",
};

function definition(input: Partial<RelationDefinition> & Pick<RelationDefinition, "key">): RelationDefinition {
  return {
    key: input.key,
    scope: input.scope ?? "work",
    usage: input.usage ?? "both",
    semantics: input.semantics ?? "reference",
    lifecycle: input.lifecycle ?? COMPLETE_BLOCK_LIFECYCLE,
    physical: input.physical,
    adapterKey: input.adapterKey,
    exemptionReason: input.exemptionReason,
  };
}

const schemaMetadata = {
  modelFiles: new Map([
    ["Child", "work-items.prisma"],
    ["Evidence", "work-items.prisma"],
    ["Parent", "work-items.prisma"],
  ]),
  onDeleteByRelationField: new Map<string, string>(),
};

test("DMMF coverage enumerates only actual FK-owning relation fields in stable order", () => {
  const relations = listPhysicalRelations({
    models: [
      { name: "Evidence", fields: [
        { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"], relationOnDelete: "SetNull" },
      ] },
      { name: "Parent", fields: [
        { name: "children", kind: "object", type: "Child", relationFromFields: [], relationToFields: [] },
      ] },
      { name: "Child", fields: [
        { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"], relationOnDelete: "Cascade" },
      ] },
    ],
  }, schemaMetadata);

  assert.deepEqual(relations.map((relation) => relation.key), [
    "Child.parentId->Parent.id",
    "Evidence.parentId->Parent.id",
  ]);
  assert.deepEqual(relations.map((relation) => relation.onDelete), ["Cascade", "SetNull"]);
  assert.deepEqual(relations.map((relation) => relation.module), ["work", "work"]);
});

test("coverage reports missing, stale, unclassified, adapter capabilities, and onDelete conflicts", () => {
  const physicalRelations = listPhysicalRelations({
    models: [
      { name: "Child", fields: [
        { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"], relationOnDelete: "Cascade" },
      ] },
      { name: "Evidence", fields: [
        { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"], relationOnDelete: "SetNull" },
      ] },
    ],
  }, schemaMetadata);
  const report = buildRelationCoverageReport({
    physicalRelations,
    catalogDefinitions: [
      definition({
        key: "work.child.parent",
        physical: { sourceModel: "Child", sourceFields: ["parentId"], targetModel: "Parent", targetFields: ["id"] },
        adapterKey: "work.child.parent",
      }),
      definition({
        key: "work.stale.parent",
        usage: "selector",
        lifecycle: { targetDelete: null, targetArchive: null, targetRestore: null, sourceRelationChange: null },
        physical: { sourceModel: "Gone", sourceFields: ["parentId"], targetModel: "Parent", targetFields: ["id"] },
      }),
    ],
    adapterCapabilities: new Map([
      ["work.child.parent", { listInbound: true }],
    ]),
  });

  assert.deepEqual(report.missing.map((relation) => relation.key), ["Evidence.parentId->Parent.id"]);
  assert.deepEqual(report.stale.map((issue) => issue.relationKey), ["work.stale.parent"]);
  assert.equal(report.unclassified.length, 0);
  assert.deepEqual(report.adapterGaps, []);
  assert.deepEqual(report.onDeleteMismatches.map((issue) => issue.relationKey), ["work.child.parent"]);
});

test("matched selector-only relations remain explicitly unclassified", () => {
  const physicalRelations = listPhysicalRelations({
    models: [{ name: "Child", fields: [
      { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"] },
    ] }],
  }, schemaMetadata);
  const report = buildRelationCoverageReport({
    physicalRelations,
    catalogDefinitions: [definition({
      key: "work.child.selector",
      usage: "selector",
      lifecycle: { targetDelete: null, targetArchive: null, targetRestore: null, sourceRelationChange: null },
      physical: { sourceModel: "Child", sourceFields: ["parentId"], targetModel: "Parent", targetFields: ["id"] },
    })],
  });

  assert.equal(report.matchedPhysical.length, 1);
  assert.equal(report.governedPhysical.length, 0);
  assert.deepEqual(report.unclassified[0]?.relationKeys, ["work.child.selector"]);
});

test("module ratchets block only configured issue growth", () => {
  const physicalRelations = listPhysicalRelations({
    models: [{ name: "Evidence", fields: [
      { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"] },
    ] }],
  }, schemaMetadata);
  const report = buildRelationCoverageReport({ physicalRelations, catalogDefinitions: [] });

  assert.deepEqual(evaluateRelationCoverageRatchets(report, {
    defaultMode: "report-only",
    modules: {},
  }), []);
  assert.deepEqual(evaluateRelationCoverageRatchets(report, {
    defaultMode: "report-only",
    modules: { work: { mode: "blocking", maxMissing: 0 } },
  }), ["work.missing=1 exceeds ratchet 0"]);
});

test("pilot target ratchet requires every inbound relation to be governed", () => {
  const physicalRelations = listPhysicalRelations({
    models: [{ name: "Evidence", fields: [
      { name: "parent", kind: "object", type: "Parent", relationFromFields: ["parentId"], relationToFields: ["id"] },
    ] }],
  }, schemaMetadata);
  const report = buildRelationCoverageReport({ physicalRelations, catalogDefinitions: [] });

  assert.deepEqual(evaluateRelationCoverageRatchets(report, {
    defaultMode: "report-only",
    modules: { work: { mode: "blocking", maxMissing: 1, requiredGovernedTargets: ["Parent"] } },
  }), ["work.target.Parent has missing=1, unclassified=0"]);
});

test("adapter capability discovery follows literal, constant, and factory relation keys", () => {
  const capabilities = listRelationAdapterCapabilitiesFromSource(`
    const PLAN_ITEMS = "work.plan.items";
    const first = { relationKey: PLAN_ITEMS, inspect() {}, cascade() {} };
    const second = { relationKey: "work.reference", inspect() {}, unlink() {} };
    function blocker(input: { relationKey: string }) {
      return { relationKey: input.relationKey, inspect() {} };
    }
    blocker({ relationKey: "work.factory.reference" });
  `);
  assert.deepEqual(capabilities.get("work.plan.items"), {
    listInbound: true,
    unlink: false,
    cascade: true,
  });
  assert.deepEqual(capabilities.get("work.reference"), {
    listInbound: true,
    unlink: true,
    cascade: false,
  });
  assert.deepEqual(capabilities.get("work.factory.reference"), {
    listInbound: true,
    unlink: false,
    cascade: false,
  });
});
