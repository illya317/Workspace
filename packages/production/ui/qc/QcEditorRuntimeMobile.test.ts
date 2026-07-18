import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { BodySurfaceSectionSpec, FormSurfaceFieldSpec, FormSurfaceItemSpec } from "@workspace/core/ui";
import type { EditorBlock, EditorDocument, EditorSlotInline, FieldModel } from "@workspace/platform/document-editor";
import { createQcEditorRuntimeMobileSection } from "./QcEditorRuntimeMobile";

test("QC mobile surface replaces paper tables with drill-down fields", () => {
  const blocks: EditorBlock[] = [
    {
      id: "files",
      type: "heading",
      level: 2,
      text: "1.1 文件确认",
    },
    {
      id: "file-table",
      type: "table",
      rows: [
        { cells: [textCell("文件名称"), textCell("文件编码"), textCell("是否在实验现场")] },
        {
          cells: [
            textCell("《检验标准》"),
            textCell("SOP001"),
            slotCell({ type: "fieldSlot", fieldKey: "pre_check/file_1", inputType: "radio", options: ["是", "否"] }),
          ],
        },
      ],
    },
    {
      id: "result",
      type: "heading",
      level: 2,
      text: "2 检验结果",
    },
    {
      id: "result-row",
      type: "paragraph",
      parts: [
        { type: "text", text: "计算结果为" },
        { type: "formulaSlot", fieldKey: "test/result", label: "计算结果", slotKind: "formula", readonlyDisplay: true },
      ],
    },
  ];
  const fieldModel: FieldModel = {
    fields: {
      "pre_check/file_1": { fieldKey: "pre_check/file_1", inputType: "radio", valueType: "boolean", options: ["是", "否"] },
      "test/result": { fieldKey: "test/result", type: "number", valueType: "number", readonlyDisplay: true },
    },
  };

  const surface = createQcEditorRuntimeMobileSection("mobile", {
    blocks,
    fieldModel,
    values: { "pre_check/file_1": "是", "test/result": "99.5" },
    onFieldChange: () => undefined,
  });

  assert.equal(surface.visibility, "mobile");
  assert.equal(surface.body.kind, "section");
  if (surface.body.kind !== "section" || surface.body.layout === "split") return;
  assert.equal(surface.body.mobilePresentation, "drilldown");
  assert.deepEqual(surface.body.sections?.map((section) => section.label), ["文件确认", "检验结果"]);
  const items = surface.body.sections?.flatMap(sectionItems) ?? [];
  const choice = fieldItem(items, "pre_check/file_1");
  const formula = fieldItem(items, "test/result");
  assert.equal(choice.label, "《检验标准》 · 是否在实验现场");
  assert.equal(choice.spec.control, "choice");
  assert.equal(choice.spec.state, "normal");
  assert.equal(formula.label, "计算结果");
  assert.equal(formula.spec.state, "readonly");
  assert.equal(formula.value, "99.5");
});

test("every generated QC record slot has one native mobile field", () => {
  const snapshotsDir = path.resolve("generated/production/qc/template-snapshots/products");
  const files = readdirSync(snapshotsDir).filter((file) => file.endsWith(".json"));
  assert.ok(files.length > 0);

  for (const file of files) {
    const snapshot = JSON.parse(readFileSync(path.join(snapshotsDir, file), "utf8")) as {
      document: EditorDocument;
      fieldModel: FieldModel;
    };
    for (const record of runtimeRecords(snapshot.document)) {
      const surface = createQcEditorRuntimeMobileSection(record.key, {
        blocks: record.blocks,
        fieldModel: snapshot.fieldModel,
        values: {},
        onFieldChange: () => undefined,
      });
      assert.equal(surface.body.kind, "section", `${file}:${record.key}`);
      if (surface.body.kind !== "section" || surface.body.layout === "split") continue;
      const items = surface.body.sections?.flatMap(sectionItems) ?? [];
      const fieldKeys = new Set(items.filter(isFieldItem).map((item) => item.key));
      const expected = new Set(record.blocks.flatMap(blockSlots).map((slot) => slot.fieldKey));
      for (const fieldKey of expected) {
        assert.ok(fieldKeys.has(fieldKey), `${file}:${record.key} missing mobile field ${fieldKey}`);
      }
      for (const item of items.filter(isFieldItem)) {
        assert.ok(String(item.label).trim(), `${file}:${record.key}:${item.key} has no mobile label`);
      }
    }
  }
});

function runtimeRecords(document: EditorDocument) {
  const records: Array<{ key: string; blocks: EditorBlock[] }> = [];
  let stageKey = "";
  let current: { key: string; blocks: EditorBlock[] } | null = null;
  let section: "stage" | "precheck" | "test" = "stage";
  for (const block of document.blocks) {
    const role = block.metadata?.qcRole;
    if (role === "stageHeading") {
      stageKey = String(block.metadata?.stageKey || block.id);
      current = null;
      section = "stage";
      continue;
    }
    if (role === "precheckSectionHeading") {
      current = { key: `${stageKey}:precheck`, blocks: [] };
      records.push(current);
      section = "precheck";
      continue;
    }
    if (role === "testHeading") {
      current = { key: `${stageKey}:${String(block.metadata?.testKey || block.id)}`, blocks: [] };
      records.push(current);
      section = "test";
      continue;
    }
    if (current && (section === "precheck" || section === "test")) current.blocks.push(block);
  }
  return records.filter((record) => record.blocks.length > 0);
}

function blockSlots(block: EditorBlock) {
  if (block.type === "paragraph") return block.parts.filter((part) => part.type !== "text");
  if (block.type === "table") {
    return block.rows.flatMap((row) => row.cells.flatMap((cell) => cell.parts.filter((part) => part.type !== "text")));
  }
  return [];
}

function sectionItems(section: BodySurfaceSectionSpec) {
  return section.body.kind === "form" ? section.body.form.content.items : [];
}

function isFieldItem(item: FormSurfaceItemSpec): item is FormSurfaceFieldSpec {
  return !("kind" in item) || item.kind === "field";
}

function fieldItem(items: FormSurfaceItemSpec[], key: string) {
  const item = items.find((candidate) => isFieldItem(candidate) && candidate.key === key);
  assert.ok(item && isFieldItem(item), `missing ${key}`);
  return item;
}

function textCell(text: string) {
  return { rawText: text, parts: [{ type: "text" as const, text }] };
}

function slotCell(slot: EditorSlotInline) {
  return { parts: [slot] };
}
