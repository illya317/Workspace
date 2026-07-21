import assert from "node:assert/strict";
import test from "node:test";
import { FieldSlot } from "./slot-extensions";

const slot = {
  type: "fieldSlot" as const,
  fieldKey: "wave-length",
  alias: "i",
  defaultValue: "278nm±2nm",
  width: "3rem",
  align: "center" as const,
  slotKind: "plain" as const,
};

test("editor slots use configured width as a minimum instead of clipping long values", () => {
  const renderHTML = FieldSlot.config.renderHTML as (input: { HTMLAttributes: Record<string, unknown> }) => unknown;
  const output = renderHTML({ HTMLAttributes: slot });

  assert.ok(Array.isArray(output));
  assert.equal((output[1] as Record<string, unknown>).style, "width:auto;min-width:min(3rem,100%);max-width:100%;min-height:1.1em;line-height:1;text-align:center");
  assert.equal(output[2], "278nm±2nm");
});
