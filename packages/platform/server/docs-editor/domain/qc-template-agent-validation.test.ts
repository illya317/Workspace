import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQcTemplateTextReplacements,
  inspectQcTemplateText,
  parseQcTemplateUpdateInput,
} from "./qc-template-agent-validation";

test("QC template inspection returns only editable text nodes with stable paths", () => {
  const result = inspectQcTemplateText({
    document: {
      id: "microbiology-hidden-id",
      blocks: [
        { type: "heading", text: "微生物限度检查" },
        { type: "table", label: "微生物试验材料", metadata: { productKey: "microbiology" } },
      ],
    },
    fieldModel: { fields: { result: { fieldKey: "microbiology/result", name: "微生物结果" } } },
    query: "微生物",
  });

  assert.equal(result.totalMatches, 3);
  assert.deepEqual(result.items.map((item) => item.path), [
    "/document/blocks/0/text",
    "/document/blocks/1/label",
    "/fieldModel/fields/result/name",
  ]);
});

test("QC template inspection uses the shared pinyin-aware search semantics", () => {
  const result = inspectQcTemplateText({
    document: { blocks: [{ type: "heading", text: "微生物限度检查" }] },
    fieldModel: {},
    query: "weishengwu",
  });

  assert.equal(result.totalMatches, 1);
});

test("QC template replacement is deterministic and preserves identifiers", () => {
  const document = {
    id: "microbiology-id",
    blocks: [
      { text: "微生物检验" },
      { rawText: "依据：微生物检验规程", metadata: { testName: "微生物检验" } },
    ],
  };
  const result = applyQcTemplateTextReplacements({
    document,
    fieldModel: { fields: { result: { name: "微生物检验" } } },
    replacements: [{
      from: "微生物检验",
      to: "微生物限度检查",
      match: "substring",
      scope: "both",
      expectedMatches: 3,
    }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.document as typeof document).id, "microbiology-id");
  assert.equal((result.document as typeof document).blocks[0].text, "微生物限度检查");
  assert.equal((result.document as typeof document).blocks[1].rawText, "依据：微生物限度检查规程");
  assert.equal((result.document as typeof document).blocks[1]?.metadata?.testName, "微生物检验");
  assert.equal(document.blocks[0].text, "微生物检验");
});

test("QC template replacement rejects stale expected match counts", () => {
  const result = applyQcTemplateTextReplacements({
    document: { blocks: [{ text: "微生物检验" }, { text: "微生物检验" }] },
    fieldModel: {},
    replacements: [{
      from: "微生物检验",
      to: "微生物限度检查",
      match: "exact",
      scope: "document",
      expectedMatches: 1,
    }],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /实际匹配 2 处/);
});

test("QC template update input requires an actual change", () => {
  const result = parseQcTemplateUpdateInput({ templateId: 12, version: 3 });
  assert.equal(result.success, false);
});

test("QC template update input accepts full structure patches", () => {
  const parsed = parseQcTemplateUpdateInput({
    templateId: 12,
    version: 3,
    patches: [
      { op: "test", path: "/document/blocks/0/id", value: "heading-1" },
      { op: "add", path: "/document/blocks/-", value: { id: "page-1", type: "pageBreak" } },
    ],
  });
  assert.equal(parsed.success, true);

  const testOnly = parseQcTemplateUpdateInput({
    templateId: 12,
    version: 3,
    patches: [{ op: "test", path: "/document/title", value: "QC" }],
  });
  assert.equal(testOnly.success, false);
});
