import assert from "node:assert/strict";
import test from "node:test";

import type { FieldConfig, TabConfig } from "@workspace/hr/types";
import {
  buildGenericTabCreateBody,
  buildGenericTabDeleteRequest,
  emptyGenericTabCreateDraft,
  genericTabCreateFields,
  isGenericTabCreateReady,
  resolveGenericTabCrudCapabilities,
} from "./generic-tab-crud";

const fields: FieldConfig[] = [
  { key: "parentId", label: "持股方", type: "fk", editable: true, required: true },
  { key: "childId", label: "被持股方", type: "fk", editable: true, required: true },
  { key: "isConsolidated", label: "并表", type: "boolean", editable: true },
  { key: "internalNote", label: "内部备注", editable: true, hidden: true },
];

const config: TabConfig = {
  title: "公司关系",
  apiPath: "/api/modules/hr/roster/company-relations",
  rowPath: (id) => `/api/modules/hr/roster/company-relations/${id}`,
  entityType: "CompanyRelation",
  fields,
  canCreate: true,
  canDelete: true,
  buildCreateBody: (draft) => ({
    ...draft,
    parentId: (draft.parentId as { id: number }).id,
    childId: (draft.childId as { id: number }).id,
  }),
};

test("CRUD actions require both config capability and explicit action permission", () => {
  assert.deepEqual(resolveGenericTabCrudCapabilities(config), { canCreate: false, canDelete: false });
  assert.deepEqual(
    resolveGenericTabCrudCapabilities(config, { canCreate: true, canDelete: false }),
    { canCreate: true, canDelete: false },
  );
  assert.deepEqual(
    resolveGenericTabCrudCapabilities({ canCreate: false, canDelete: true }, { canCreate: true, canDelete: true }),
    { canCreate: false, canDelete: true },
  );
});

test("create draft exposes visible editable fields and requires valid FK selections", () => {
  const createFields = genericTabCreateFields(fields);
  assert.deepEqual(createFields.map((field) => field.key), ["parentId", "childId", "isConsolidated"]);
  const draft = emptyGenericTabCreateDraft(createFields);
  assert.equal(draft.isConsolidated, false);
  assert.equal(isGenericTabCreateReady(createFields, draft), false);
  draft.parentId = { id: 8, name: "丰华生物" };
  draft.childId = { id: 9, name: "加拿大公司" };
  assert.equal(isGenericTabCreateReady(createFields, draft), true);
  assert.deepEqual(buildGenericTabCreateBody(config, draft), {
    parentId: 8,
    childId: 9,
    isConsolidated: false,
  });
});

test("delete request uses the row resource path and optimistic version", () => {
  assert.deepEqual(buildGenericTabDeleteRequest(config, { id: 46, version: 3 }), {
    path: "/api/modules/hr/roster/company-relations/46",
    headers: { "If-Match": "3" },
  });
});
