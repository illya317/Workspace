import assert from "node:assert/strict";
import test from "node:test";

import type { FormSurfaceFieldSpec, FormSurfaceItemSpec } from "../../FormSurface.types";
import {
  findMissingFormSurfaceRequiredFields,
  isFormSurfaceFieldRequired,
  resolveFormSurfaceInputSpec,
  withFormSurfaceRequiredErrors,
} from "./form-surface-required";

function textField(overrides: Partial<FormSurfaceFieldSpec> = {}): FormSurfaceFieldSpec {
  return {
    key: "name",
    label: "名称",
    spec: { valueType: "string", control: "text" },
    value: "",
    ...overrides,
  };
}

test("FormSurface normalizes every required declaration into one contract", () => {
  const topLevelRequired = textField({ required: true });
  const validationRequired = textField({ spec: { valueType: "string", control: "text", validation: { required: true } } });
  const stateRequired = textField({ spec: { valueType: "string", control: "text", state: "required" } });

  assert.equal(isFormSurfaceFieldRequired(topLevelRequired), true);
  assert.equal(isFormSurfaceFieldRequired(validationRequired), true);
  assert.equal(isFormSurfaceFieldRequired(stateRequired), true);
  assert.equal(resolveFormSurfaceInputSpec(topLevelRequired).validation?.required, true);
});

test("FormSurface blocks empty required fields across nested field groups", () => {
  const required = textField({ required: true });
  const disabledRequired = textField({ key: "disabled", required: true, disabled: true });
  const items: FormSurfaceItemSpec[] = [{
    kind: "section",
    key: "identity",
    items: [required, disabledRequired],
  }];

  assert.deepEqual(findMissingFormSurfaceRequiredFields(items), ["name"]);
  const withErrors = withFormSurfaceRequiredErrors(items);
  const nested = withErrors[0];
  assert.equal(nested.kind, "section");
  if (nested.kind !== "section") return;
  const requiredItem = nested.items[0];
  assert.equal("error" in requiredItem ? requiredItem.error : undefined, "必填");
});

test("FormSurface accepts false and zero as required values", () => {
  const items = [
    textField({ key: "enabled", required: true, value: false }),
    textField({ key: "count", required: true, value: 0 }),
  ];
  assert.deepEqual(findMissingFormSurfaceRequiredFields(items), []);
});
