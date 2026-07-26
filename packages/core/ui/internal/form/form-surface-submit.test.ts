import assert from "node:assert/strict";
import test from "node:test";
import type { FormSurfaceActionSpec } from "../../FormSurface.types";
import {
  executeFormSurfaceSubmit,
  isFormSurfaceNativeSubmitAction,
  resolveFormSurfaceSubmitAction,
} from "./form-surface-submit";

test("Enter cannot bypass a disabled primary save action", () => {
  let submitted = 0;
  const actions: FormSurfaceActionSpec[] = [{
    key: "save",
    action: "save",
    disabled: true,
  }];

  assert.equal(executeFormSurfaceSubmit({ onSubmit: () => { submitted += 1; } }, actions), false);
  assert.equal(submitted, 0);
});

test("Enter follows the enabled primary submit action", () => {
  let submitted = 0;
  const actions: FormSurfaceActionSpec[] = [{
    key: "submit",
    action: "submit",
    disabled: false,
  }];

  assert.equal(executeFormSurfaceSubmit({ onSubmit: () => { submitted += 1; } }, actions), true);
  assert.equal(submitted, 1);
  assert.equal(resolveFormSurfaceSubmitAction(actions)?.key, "submit");
});

test("actions with their own click handler are not native submit buttons", () => {
  const action: FormSurfaceActionSpec = {
    key: "submit",
    action: "submit",
    onClick: () => undefined,
  };

  assert.equal(isFormSurfaceNativeSubmitAction(action), false);
  assert.equal(isFormSurfaceNativeSubmitAction({ ...action, onClick: undefined }), true);
});

test("Enter follows the native action before click-owned lifecycle actions", () => {
  const actions: FormSurfaceActionSpec[] = [
    { key: "workflow-submit", action: "submit", disabled: false, onClick: () => undefined },
    { key: "save", action: "save", disabled: true },
  ];

  assert.equal(resolveFormSurfaceSubmitAction(actions)?.key, "save");
});

test("a submit callback without a lifecycle action has no Enter path", () => {
  let submitted = 0;
  assert.equal(executeFormSurfaceSubmit({ onSubmit: () => { submitted += 1; } }, []), false);
  assert.equal(submitted, 0);
});
