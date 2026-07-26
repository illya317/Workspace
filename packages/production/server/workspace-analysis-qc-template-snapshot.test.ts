import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { QcBatchTemplateSnapshot } from "@workspace/production/types";

import type { QcTemplateSnapshotValueRow } from "./workspace-analysis-qc-template-snapshot";

mock.module("server-only", { namedExports: {} } as never);

const {
  QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE,
  listQcTemplateSnapshotPartitions,
  readQcTemplateSnapshotSegment,
} = await import("./workspace-analysis-qc-template-snapshot");

const baseContext = {
  batchId: 101,
  recordUid: "capacity-fixture",
  batchNumber: "260701",
  productId: 1,
  templateId: 1,
  templateVersion: 1,
} as const;

const syntheticTemplates = Array.from({ length: 3 }, (_, templateIndex) => ({
  productKey: `synthetic_product_${templateIndex + 1}`,
  productName: `合成产品 ${templateIndex + 1}`,
  document: {
    schemaVersion: 1,
    kind: "qc-editor-document",
    id: `synthetic-document-${templateIndex + 1}`,
    title: `合成容量模板 ${templateIndex + 1}`,
    blocks: Array.from({ length: 1_200 }, (_, rowIndex) => ({
      id: `row-${rowIndex + 1}`,
      type: "paragraph",
      parts: [{ type: "text", text: `容量测试行 ${rowIndex + 1}` }],
    })),
  },
  fieldModel: {
    schemaVersion: 1,
    fields: Object.fromEntries(Array.from({ length: 1_200 }, (_, fieldIndex) => [
      `synthetic/field_${fieldIndex + 1}`,
      { fieldKey: `synthetic/field_${fieldIndex + 1}`, valueType: "text", attr: "fillable" },
    ])),
    formulas: {},
  },
}));

test("large synthetic QC templates reconstruct exactly from bounded stable segments", () => {

  let totalLeafCount = 0;
  let largestSegmentBytes = 0;
  for (const [fileIndex, generated] of syntheticTemplates.entries()) {
    const file = `${generated.productKey}.json`;
    const context = {
      ...baseContext,
      batchId: baseContext.batchId + fileIndex,
      productKey: generated.productKey,
      productName: generated.productName,
    };
    const snapshot: QcBatchTemplateSnapshot = {
      ...context,
      document: generated.document,
      fieldModel: generated.fieldModel,
      capturedAt: "2026-07-25T00:00:00.000Z",
    };

    for (const section of ["document", "fieldModel"] as const) {
      const partitions = listQcTemplateSnapshotPartitions({ context, snapshot, section });
      assert.ok(partitions.length > 1, `${file} ${section} should require multiple bounded segments`);
      const allRows: QcTemplateSnapshotValueRow[] = [];
      let previousEnd = 0;
      for (const partition of partitions) {
        const rows = readQcTemplateSnapshotSegment({ context, snapshot, section, segment: partition.segment });
        assert.ok(rows.length <= QC_TEMPLATE_SNAPSHOT_SEGMENT_SIZE);
        assert.equal(rows.length, partition.leafCount);
        assert.equal(rows[0]?.ordinal, partition.leafStart);
        assert.equal(rows.at(-1)?.ordinal, partition.leafEnd);
        assert.equal(rows[0]?.path, partition.firstPath);
        assert.equal(rows.at(-1)?.path, partition.lastPath);
        assert.equal(partition.leafStart, previousEnd + 1);
        previousEnd = partition.leafEnd;
        allRows.push(...rows);
        totalLeafCount += rows.length;
        largestSegmentBytes = Math.max(largestSegmentBytes, new TextEncoder().encode(JSON.stringify(rows)).byteLength);
      }
      assert.deepEqual(reconstructNestedValue(allRows), generated[section], `${file} ${section} did not reconstruct exactly`);
    }
  }

  assert.ok(totalLeafCount > 25_000);
  assert.ok(largestSegmentBytes < 5 * 1024 * 1024);
});

test("object keys use locale-independent Unicode code-point order", () => {
  const context = { ...baseContext, productKey: "ordering", productName: "排序测试" };
  const snapshot: QcBatchTemplateSnapshot = {
    ...context,
    capturedAt: "2026-07-25T00:00:00.000Z",
    document: { "😀": "astral", "\uE000": "private-use", z: "ascii" },
    fieldModel: {},
  };
  const rows = readQcTemplateSnapshotSegment({ context, snapshot, section: "document", segment: 1 });
  assert.deepEqual(rows.map((row) => row.path), ["$.z", "$[\"\uE000\"]", "$[\"😀\"]"]);
});

function reconstructNestedValue(rows: readonly QcTemplateSnapshotValueRow[]): unknown {
  const unset = Symbol("unset");
  let root: unknown | typeof unset = unset;
  for (const row of rows) {
    const path = parseNestedValuePath(row.path);
    const value = decodeNestedValue(row);
    if (path.length === 0) {
      assert.equal(root, unset, `duplicate root row ${row.path}`);
      root = value;
      continue;
    }
    if (root === unset) root = typeof path[0] === "number" ? [] : {};
    let current = root;
    for (let index = 0; index < path.length; index += 1) {
      const member = path[index]!;
      if (index === path.length - 1) {
        setNestedMember(current, member, value);
        continue;
      }
      const existing = getNestedMember(current, member);
      if (existing !== undefined) {
        current = existing;
        continue;
      }
      const container = typeof path[index + 1] === "number" ? [] : {};
      setNestedMember(current, member, container);
      current = container;
    }
  }
  assert.notEqual(root, unset, "a snapshot section must produce at least one leaf");
  return root;
}

function decodeNestedValue(row: QcTemplateSnapshotValueRow): unknown {
  if (row.valueKind === "null") {
    assert.equal(row.textValue, null);
    return null;
  }
  if (row.valueKind === "number") {
    assert.equal(row.textValue, String(row.numberValue));
    return row.numberValue;
  }
  if (row.valueKind === "boolean") {
    assert.equal(row.textValue, String(row.booleanValue));
    return row.booleanValue;
  }
  if (row.valueKind === "array") {
    assert.equal(row.textValue, "[]");
    return [];
  }
  if (row.valueKind === "object") {
    assert.equal(row.textValue, "{}");
    return {};
  }
  assert.equal(row.valueKind, "text");
  return row.textValue;
}

function parseNestedValuePath(path: string): Array<string | number> {
  assert.equal(path[0], "$");
  const members: Array<string | number> = [];
  let offset = 1;
  while (offset < path.length) {
    if (path[offset] === ".") {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(path.slice(offset + 1));
      assert.ok(match, `invalid dotted path ${path}`);
      members.push(match[0]);
      offset += match[0].length + 1;
      continue;
    }
    assert.equal(path[offset], "[", `invalid member path ${path}`);
    if (path[offset + 1] === "\"") {
      let stringEnd = offset + 2;
      let escaped = false;
      for (; stringEnd < path.length; stringEnd += 1) {
        const character = path[stringEnd]!;
        if (character === "\"" && !escaped) break;
        escaped = character === "\\" && !escaped;
        if (character !== "\\") escaped = false;
      }
      assert.equal(path[stringEnd], "\"", `unterminated quoted path ${path}`);
      assert.equal(path[stringEnd + 1], "]", `invalid quoted path ${path}`);
      members.push(JSON.parse(path.slice(offset + 1, stringEnd + 1)) as string);
      offset = stringEnd + 2;
      continue;
    }
    const bracketEnd = path.indexOf("]", offset + 1);
    assert.ok(bracketEnd > offset + 1, `invalid array path ${path}`);
    const index = Number(path.slice(offset + 1, bracketEnd));
    assert.ok(Number.isSafeInteger(index) && index >= 0, `invalid array index ${path}`);
    members.push(index);
    offset = bracketEnd + 1;
  }
  return members;
}

function getNestedMember(container: unknown, member: string | number) {
  assert.ok(container && typeof container === "object");
  return (container as Record<string | number, unknown>)[member];
}

function setNestedMember(container: unknown, member: string | number, value: unknown) {
  assert.ok(container && typeof container === "object");
  if (typeof member === "number") {
    assert.ok(Array.isArray(container));
    assert.equal(Object.hasOwn(container, member), false, `duplicate array member ${member}`);
    container[member] = value;
    return;
  }
  assert.equal(Array.isArray(container), false);
  assert.equal(Object.hasOwn(container, member), false, `duplicate object member ${member}`);
  Object.defineProperty(container, member, { value, enumerable: true, configurable: true, writable: true });
}
