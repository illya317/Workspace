import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveInputSurfaceInteractionState } from "./InputSurfaceTypes";
import {
  composeTimeValue,
  normalizeTimeTextPart,
  parseTimeValue,
  updateTimeDraftPart,
} from "./time-field-value";
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

test("time input keeps a progressive first digit so a second digit can be entered", () => {
  const firstHour = normalizeTimeTextPart("1", 23);
  assert.equal(firstHour, "1");
  assert.equal(composeTimeValue(firstHour, ""), "01:00");
  assert.deepEqual(parseTimeValue("01:00"), { hour: "01", minute: "00" });

  const secondHour = normalizeTimeTextPart("12", 23);
  assert.equal(secondHour, "12");
  assert.equal(composeTimeValue(secondHour, "0"), "12:00");
});

test("optional time input can clear both controlled segments back to null", () => {
  const initialDraft = parseTimeValue("09:30");
  const hourCleared = updateTimeDraftPart(initialDraft, "hour", "");
  assert.deepEqual(hourCleared, {
    draft: { hour: "", minute: "30" },
    value: "00:30",
  });

  const fullyCleared = updateTimeDraftPart(hourCleared.draft, "minute", "");
  assert.deepEqual(fullyCleared, {
    draft: { hour: "", minute: "" },
    value: null,
  });
});

test("grouped choice clear is forwarded instead of being swallowed at the group stage", () => {
  assert.deepEqual(resolveGroupedChoiceGroupSelection(null), { kind: "clear" });
  assert.deepEqual(resolveGroupedChoiceGroupSelection("management"), {
    kind: "group",
    groupKey: "management",
  });
});
