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
  { key: "sourceId", label: "来源", type: "fk", editable: true, required: true },
  { key: "targetId", label: "目标", type: "fk", editable: true, required: true },
  { key: "enabled", label: "启用", type: "boolean", editable: true },
  { key: "internalNote", label: "内部备注", editable: true, hidden: true },
];

const config: TabConfig = {
  title: "通用记录",
  apiPath: "/api/modules/test/records",
  rowPath: (id) => `/api/modules/test/records/${id}`,
  entityType: "TestRecord",
  fields,
  canCreate: true,
  canDelete: true,
  buildCreateBody: (draft) => ({
    ...draft,
    sourceId: (draft.sourceId as { id: number }).id,
    targetId: (draft.targetId as { id: number }).id,
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
  assert.deepEqual(createFields.map((field) => field.key), ["sourceId", "targetId", "enabled"]);
  const draft = emptyGenericTabCreateDraft(createFields);
  assert.equal(draft.enabled, false);
  assert.equal(isGenericTabCreateReady(createFields, draft), false);
  draft.sourceId = { id: 8, name: "来源记录" };
  draft.targetId = { id: 9, name: "目标记录" };
  assert.equal(isGenericTabCreateReady(createFields, draft), true);
  assert.deepEqual(buildGenericTabCreateBody(config, draft), {
    sourceId: 8,
    targetId: 9,
    enabled: false,
  });
});

test("delete request uses the row resource path and optimistic version", () => {
  assert.deepEqual(buildGenericTabDeleteRequest(config, { id: 46, version: 3 }), {
    path: "/api/modules/test/records/46",
    headers: { "If-Match": "3" },
  });
});
