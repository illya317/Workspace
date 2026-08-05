import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveInputSurfaceInteractionState } from "./InputSurfaceTypes";
import { resolveGroupedChoiceGroupSelection } from "./grouped-choice-selection";

test("FormSurface forwards top-level disabled to the shared InputSurface seam", () => {
  const controls = readFileSync(new URL("../form/FormSurface.controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /<InputSurfaceRenderer[\s\S]*?disabled=\{field\.disabled\}/);

  assert.deepEqual(resolveInputSurfaceInteractionState(undefined, { disabled: true }), {
    hidden: false,
    readonlyDisplay: false,
    disabled: true,
    readOnly: false,
    required: false,
  });
});

test("InputSurface merges top-level readOnly with spec interaction state", () => {
  assert.deepEqual(resolveInputSurfaceInteractionState("required", { readOnly: true }), {
    hidden: false,
    readonlyDisplay: false,
    disabled: false,
    readOnly: true,
    required: true,
  });
  assert.deepEqual(resolveInputSurfaceInteractionState("readonly"), {
    hidden: false,
    readonlyDisplay: true,
    disabled: false,
    readOnly: true,
    required: false,
  });
});

test("grouped choice clear is forwarded instead of being swallowed at the group stage", () => {
  assert.deepEqual(resolveGroupedChoiceGroupSelection(null), { kind: "clear" });
  assert.deepEqual(resolveGroupedChoiceGroupSelection("management"), {
    kind: "group",
    groupKey: "management",
  });
});
