import assert from "node:assert/strict";
import test from "node:test";

import type {
  BusinessRequiredPolicy,
  RelationPolicyPreset,
} from "@workspace/platform/relation-registration-contract";

import type { DatabaseSchemaModule } from "../../../database-schema-contract";
import type {
  RelationPolicyCatalog,
  RelationPolicyCatalogItem,
  RelationPolicyField,
} from "../../../relation-policy-contract";
import {
  editableRelationPolicySettings,
  relationPolicyDraftChanged,
  relationPolicyDraftFromRelation,
  relationPolicyModulePath,
  relationPolicyModuleTreeKey,
  relationPolicyRelationTreeKey,
  relationPolicyRequiredSummary,
  relationPolicyState,
  relationPolicyStatus,
  relationPolicyTreeItems,
} from "./DatabaseRelationsTabPolicyModel";
import { createRelationPolicyBody } from "./DatabaseRelationsTabPolicySections";

function field<T>(
  mode: RelationPolicyField<T>["mode"],
  effective: T | null,
  allowed: T[],
): RelationPolicyField<T> {
  return {
    mode,
    baseline: effective,
    effective,
    allowed,
    overridden: false,
    reason: null,
  };
}

function relation(input: {
  relationKey: string;
  moduleKey: string;
  title: string;
  deleteMode?: RelationPolicyField<RelationPolicyPreset>["mode"];
  requiredMode?: RelationPolicyField<BusinessRequiredPolicy>["mode"];
  required?: BusinessRequiredPolicy | null;
  issues?: string[];
  orphanPhysical?: boolean;
}): RelationPolicyCatalogItem {
  return {
    relationKey: input.relationKey,
    moduleKey: input.moduleKey,
    title: input.title,
    source: { entity: "ProjectPhase", fields: ["projectId"], label: "项目阶段" },
    target: { entity: "Project", fields: ["id"], label: "项目" },
    nullable: false,
    semantics: "reference",
    policyGroup: input.orphanPhysical ? null : {
      policyKey: "work.projects.shared",
      relationKeys: [input.relationKey],
      baselineHash: "a".repeat(64),
      version: 0,
      overridden: false,
      stale: false,
      updatedAt: null,
      updatedByUserId: null,
    },
    deleteLinkage: field(
      input.deleteMode ?? "editable",
      "block",
      ["block", "confirm_unlink"],
    ),
    businessRequired: field(
      input.requiredMode ?? "editable",
      input.required === undefined ? "required" : input.required,
      ["required", "optional"],
    ),
    physicalEvidence: {
      constraintName: "ProjectPhase_projectId_fkey",
      sourceTable: "ProjectPhase",
      sourceColumns: ["projectId"],
      targetTable: "Project",
      targetColumns: ["id"],
      sourceRequired: true,
      onDelete: "restrict",
    },
    orphanPhysical: input.orphanPhysical ?? false,
    issues: input.issues ?? [],
  };
}

const schemaModules: DatabaseSchemaModule[] = [{
  key: "work",
  label: "工作",
  level: "L1",
  directTableCount: 1,
  totalTableCount: 2,
  children: [{
    key: "work.projects",
    label: "项目",
    level: "L2",
    directTableCount: 1,
    totalTableCount: 1,
    children: [],
  }],
}, {
  key: "hr",
  label: "人力资源",
  level: "L1",
  directTableCount: 0,
  totalTableCount: 0,
  children: [],
}];

const editable = relation({
  relationKey: "work.project.phase.project",
  moduleKey: "work.projects",
  title: "项目阶段 → 项目",
});
const fixed = relation({
  relationKey: "work.project.owner",
  moduleKey: "work",
  title: "项目 → 负责人",
  deleteMode: "fixed",
  requiredMode: "fixed",
});
const invalid = relation({
  relationKey: "physical.Project.ownerId",
  moduleKey: "physical",
  title: "未归类数据库外键",
  deleteMode: "invalid",
  requiredMode: "invalid",
  required: null,
  issues: ["数据库外键未登记为业务关系"],
  orphanPhysical: true,
});

const catalog: RelationPolicyCatalog = {
  generatedAt: "2026-07-31T00:00:00.000Z",
  modules: [
    { key: "work", label: "工作", relationCount: 1, editableRelationCount: 0, invalidRelationCount: 0 },
    { key: "work.projects", label: "项目", relationCount: 1, editableRelationCount: 1, invalidRelationCount: 0 },
    { key: "hr", label: "人力资源", relationCount: 0, editableRelationCount: 0, invalidRelationCount: 0 },
    { key: "settings", label: "设置", relationCount: 0, editableRelationCount: 0, invalidRelationCount: 0 },
    { key: "physical", label: "数据库未归类", relationCount: 1, editableRelationCount: 0, invalidRelationCount: 1 },
  ],
  relations: [editable, fixed, invalid],
};

function flattenKeys(
  items: ReturnType<typeof relationPolicyTreeItems>,
): string[] {
  return items.flatMap((item) => [
    String(item.key),
    ...flattenKeys(item.children ?? []),
  ]);
}

test("relation tree keeps every schema and catalog module, including zero-relation modules", () => {
  const items = relationPolicyTreeItems(catalog, schemaModules);
  const keys = flattenKeys(items);

  assert.equal(keys.includes(relationPolicyModuleTreeKey("work")), true);
  assert.equal(keys.includes(relationPolicyModuleTreeKey("work.projects")), true);
  assert.equal(keys.includes(relationPolicyModuleTreeKey("hr")), true);
  assert.equal(keys.includes(relationPolicyModuleTreeKey("settings")), true);
  assert.equal(keys.includes(relationPolicyModuleTreeKey("physical")), true);
  assert.equal(keys.includes(relationPolicyRelationTreeKey(editable.relationKey)), true);
  assert.equal(keys.includes(relationPolicyRelationTreeKey(fixed.relationKey)), true);
  assert.equal(keys.includes(relationPolicyRelationTreeKey(invalid.relationKey)), true);
});

test("relation tree nests a relation directly under its owning module", () => {
  const items = relationPolicyTreeItems(catalog, schemaModules);
  const work = items.find((item) => item.key === relationPolicyModuleTreeKey("work"));
  const projects = work?.children?.find((item) => (
    item.key === relationPolicyModuleTreeKey("work.projects")
  ));

  assert.equal(
    projects?.children?.some((item) => (
      item.key === relationPolicyRelationTreeKey(editable.relationKey)
    )),
    true,
  );
  assert.deepEqual(relationPolicyModulePath(schemaModules, "work.projects"), ["work", "work.projects"]);
});

test("relation state distinguishes editable, fixed and invalid contracts", () => {
  assert.equal(relationPolicyState(editable), "editable");
  assert.deepEqual(relationPolicyStatus(editable), {
    state: "editable",
    label: "可调整",
    tone: "success",
  });
  assert.equal(relationPolicyState(fixed), "fixed");
  assert.equal(relationPolicyStatus(fixed).label, "系统规则");
  assert.equal(relationPolicyState(invalid), "invalid");
  assert.equal(relationPolicyStatus(invalid).label, "需补规则");
});

test("business-required summary never infers from physical NOT NULL evidence", () => {
  assert.equal(invalid.physicalEvidence?.sourceRequired, true);
  assert.equal(relationPolicyRequiredSummary(invalid), "未接入业务规则");
});

test("editable mutation submits both authored fields without hidden lifecycle fields", () => {
  const draft = relationPolicyDraftFromRelation(editable);
  assert.equal(relationPolicyDraftChanged(editable, draft), false);

  const changed = {
    ...draft,
    targetDelete: "confirm_unlink" as const,
    businessRequired: "optional" as const,
  };
  assert.equal(relationPolicyDraftChanged(editable, changed), true);
  assert.deepEqual(editableRelationPolicySettings(editable, changed), {
    targetDelete: "confirm_unlink",
    businessRequired: "optional",
  });
});

test("policy body is master-detail and puts the two business controls first", () => {
  const body = createRelationPolicyBody({
    catalog,
    schemaModules,
    loading: false,
    selectedRelation: editable,
    draft: relationPolicyDraftFromRelation(editable),
    reason: "",
    saving: false,
    expandedModuleKeys: ["work", "work.projects"],
    mobileDetailActive: true,
    onSelectRelation: () => undefined,
    onOpenModule: () => undefined,
    onToggleModule: () => undefined,
    onDraftChange: () => undefined,
    onReasonChange: () => undefined,
    onNavigateToList: () => undefined,
    onSave: () => undefined,
    onReset: () => undefined,
  });

  assert.equal(body.kind, "section");
  if (body.kind !== "section" || body.layout !== "split") {
    assert.fail("expected master-detail body");
  }
  assert.equal(body.mobile?.detailActive, true);
  assert.deepEqual(body.desktop?.ratio, [3, 7]);
  if (body.detail.kind !== "section" || body.detail.layout === "split") {
    assert.fail("expected composed section detail");
  }
  const detailSections = body.detail.sections ?? [];
  assert.equal(detailSections[0]?.key, "relation-policy-editor");
  const evidenceSection = detailSections.at(-1);
  assert.equal(evidenceSection?.key, "relation-policy-physical-evidence");
  assert.equal(evidenceSection?.label, "数据库证据");
  assert.equal(evidenceSection?.disclosure, undefined);

  const editorBody = detailSections[0]?.body;
  assert.equal(editorBody?.kind, "form");
  if (editorBody?.kind !== "form") assert.fail("expected form editor");
  const items = editorBody.form.content.items;
  assert.deepEqual(items.slice(0, 2).map((item) => item.key), [
    "targetDelete",
    "businessRequired",
  ]);
  const deleteField = items[0];
  assert.equal("spec" in deleteField ? deleteField.spec.presentation : undefined, "choice");
});
