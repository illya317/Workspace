import assert from "node:assert/strict";
import test from "node:test";

import { defineBusinessTemporalRegistration } from "../contracts/business-temporal";
import { createBusinessTemporalRecordSections } from "./business-temporal-records";

const registration = defineBusinessTemporalRegistration({
  key: "example.record-table",
  ownerModuleKey: "example",
  resourceKey: "example.records",
  aggregate: "ExamplePeriod",
  maturity: "partial",
  records: {
    authority: [{ kind: "model", model: "ExamplePeriod", fields: ["id", "missingFieldsJson"], role: "period" }],
    supplementary: [{ kind: "json-field", model: "LegacyExample", field: "periods", role: "legacy-source" }],
  },
  commands: ["change", "correct"],
  ui: {
    asOf: "required",
    upcoming: true,
    history: true,
    recordState: false,
    sourceNavigation: false,
    recordView: {
      presentation: "expandable-record-list",
      modulePath: "packages/example/ExampleRecordList.tsx",
      registrationBinding: "EXAMPLE_TEMPORAL",
    },
  },
  baseline: {
    persistence: "preload-authority",
    missingRecordState: "confirm-unless-explicitly-inactive",
    missingValidFrom: "open-boundary-with-quality-marker",
    missingValidThrough: "open-boundary",
    missingAttributes: "null-with-nonblocking-quality-marker",
    missingFieldCompletion: "separate-patch-command",
    missingFieldPresentation: "inline-editable",
    knownFieldPresentation: "read-only",
    existingFactCorrection: "separate-audited-command",
    existingFactCorrectionPresentation: "explicit-mode",
    businessChange: "new-lifecycle-fact",
    requiredFields: [],
    defaultQuery: "include-incomplete",
    exactBoundaryAutomation: "require-known-boundary",
    hardConflicts: "quarantine",
  },
  policy: { storage: "effective-version", granularity: "date", futureChanges: "allow", sameDayChanges: "single", overlaps: "allow", gaps: "allow", revision: "supersede", deletion: "never" },
});

test("record sections standardize selection, detail and configured baseline completion", () => {
  const rows = [{ id: 1, company: "甲公司" }, { id: 2, company: "乙公司" }];
  const sections = createBusinessTemporalRecordSections({
    registration,
    key: "example-period",
    title: "周期记录（2）",
    rows,
    columns: [{ key: "company", label: "公司", cell: (row) => row.company }],
    visibleColumns: ["company"],
    rowKey: (row) => row.id,
    selectedKey: 2,
    onSelect: () => undefined,
    detail: {
      items: [{ kind: "readonly", key: "known", label: "已知资料", value: "只读" }],
      mutation: {
        kind: "supplement-missing",
        targetFields: ["startMonth"],
        missingFields: ["startMonth"],
        actions: [{ key: "save", action: "save", label: "保存补充资料" }],
      },
    },
  });
  assert.deepEqual(sections.map((section) => section.key), ["example-period-records"]);
  const tableBody = sections[0].body;
  if (tableBody.kind !== "section" || tableBody.layout === "split") {
    assert.fail("expected a composed section body");
  }
  const table = tableBody.sections?.[0].body;
  assert.equal(table?.kind, "data");
  if (table?.kind === "data" && table.data.kind === "table") {
    assert.equal(table.data.rowState?.(rows[1]), "selected");
    assert.equal(table.data.expandedRowKey, 2);
    assert.equal(table.data.expandedRow?.(rows[1])?.kind, "form");
  }
});

test("record sections reject supplement configuration for already-known fields", () => {
  assert.throws(() => createBusinessTemporalRecordSections({
    registration,
    key: "example-period",
    title: "周期记录",
    rows: [{ id: 1 }],
    columns: [{ key: "id", label: "ID", cell: (row) => row.id }],
    visibleColumns: ["id"],
    rowKey: (row) => row.id,
    selectedKey: 1,
    onSelect: () => undefined,
    detail: {
      items: [],
      mutation: {
        kind: "supplement-missing",
        targetFields: ["companyId"],
        missingFields: ["startMonth"],
        actions: [],
      },
    },
  }), /字段配置无效/);
});

test("record sections keep supplemental history inside the selected row", () => {
  const rows = [{ id: 1, company: "甲公司" }];
  const sections = createBusinessTemporalRecordSections({
    registration,
    key: "example-history",
    title: "周期记录（1）",
    rows,
    columns: [{ key: "company", label: "公司", cell: (row) => row.company }],
    visibleColumns: ["company"],
    rowKey: (row) => row.id,
    selectedKey: 1,
    onSelect: () => undefined,
    detail: {
      items: [{ kind: "readonly", key: "company", label: "公司", value: "甲公司" }],
      supplemental: [{
        kind: "data",
        data: {
          kind: "table",
          rows: [{ id: "history-1", state: "历史" }],
          columns: [{ key: "state", label: "状态", cell: (row) => row.state }],
          visibleColumns: ["state"],
          rowKey: (row) => row.id,
        },
      }],
    },
  });
  const body = sections[0].body;
  if (body.kind !== "section" || body.layout === "split") {
    assert.fail("expected a composed section body");
  }
  const table = body.sections?.[0].body;
  assert.equal(table?.kind, "data");
  if (table?.kind === "data" && table.data.kind === "table") {
    const expanded = table.data.expandedRow?.(rows[0]);
    assert.equal(expanded?.kind, "group");
    if (expanded?.kind === "group") {
      assert.deepEqual(expanded.items.map((item) => item.kind), ["form", "data"]);
    }
  }
});

test("record sections reject callers whose registration did not adopt the standard record view", () => {
  const undeclared = {
    ...registration,
    key: "example.undeclared-record-table",
    ui: { ...registration.ui, recordView: undefined },
  };
  assert.throws(() => createBusinessTemporalRecordSections({
    registration: undeclared,
    key: "undeclared-period",
    title: "周期记录",
    rows: [{ id: 1 }],
    columns: [{ key: "id", label: "ID", cell: (row) => row.id }],
    visibleColumns: ["id"],
    rowKey: (row) => row.id,
    selectedKey: null,
    onSelect: () => undefined,
  }), /未声明 ui\.recordView/);
});

test("record sections accept explicitly configured existing-field editing", () => {
  assert.doesNotThrow(() => createBusinessTemporalRecordSections({
    registration,
    key: "editable-period",
    title: "周期记录",
    rows: [{ id: 1, note: "原值" }],
    columns: [{ key: "note", label: "备注", cell: (row) => row.note }],
    visibleColumns: ["note"],
    rowKey: (row) => row.id,
    selectedKey: 1,
    onSelect: () => undefined,
    detail: {
      items: [{ key: "note", label: "备注", value: "原值", spec: { valueType: "string", control: "text" } }],
      edit: { kind: "edit-existing", targetFields: ["note"], persistence: "page-save" },
    },
  }));
});
