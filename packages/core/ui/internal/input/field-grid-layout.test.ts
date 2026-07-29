import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveFieldGridInlineLabelWidth,
  resolveFieldGridStackLabelHeight,
} from "./field-grid-layout";

test("FieldGrid grows one shared label track from the Core minimum", () => {
  assert.equal(resolveFieldGridInlineLabelWidth({
    cellWidthPx: 480,
    naturalLabelWidthsPx: [56, 144, 96],
    rootFontSizePx: 16,
  }), 144);
});

test("FieldGrid preserves the control minimum before truncating labels", () => {
  assert.equal(resolveFieldGridInlineLabelWidth({
    cellWidthPx: 280,
    naturalLabelWidthsPx: [240],
    rootFontSizePx: 16,
  }), 144);
});

test("FieldGrid gives every stacked cell the tallest section label height", () => {
  assert.equal(resolveFieldGridStackLabelHeight([20, 40, 20]), 40);
  assert.equal(resolveFieldGridStackLabelHeight([]), 0);
});
