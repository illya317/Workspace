import type {
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceTagListFieldSpec,
} from "../../FormSurface.types";
import { inputSurfaceStateSet, resolveInputSurfaceInteractionState } from "../input/InputSurfaceTypes";

type FormSurfaceLeafField<T> =
  | FormSurfaceFieldSpec
  | FormSurfaceReadOnlyFieldSpec
  | FormSurfaceTagListFieldSpec<T>;

function isInputField<T>(field: FormSurfaceItemSpec<T>): field is FormSurfaceFieldSpec {
  return !("kind" in field) || field.kind === "field";
}

export function isFormSurfaceFieldRequired<T>(field: FormSurfaceLeafField<T>) {
  if (!isInputField(field)) return field.required === true;
  return field.required === true
    || field.spec.validation?.required === true
    || inputSurfaceStateSet(field.spec.state).has("required");
}

export function resolveFormSurfaceInputSpec(field: FormSurfaceFieldSpec) {
  if (!isFormSurfaceFieldRequired(field) || field.spec.validation?.required) return field.spec;
  return {
    ...field.spec,
    validation: { ...field.spec.validation, required: true },
  };
}

function isEmptyRequiredValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isMissingRequiredField<T>(field: FormSurfaceLeafField<T>) {
  if (!isFormSurfaceFieldRequired(field) || field.kind === "readonly") return false;
  if (field.kind === "tagList") return !field.disabled && field.items.length === 0;
  const interaction = resolveInputSurfaceInteractionState(field.spec.state, {
    disabled: field.disabled,
    readOnly: field.readOnly,
  });
  if (interaction.hidden || interaction.disabled || interaction.readOnly) return false;
  return isEmptyRequiredValue(field.value);
}

export function findMissingFormSurfaceRequiredFields<T>(items: FormSurfaceItemSpec<T>[]): string[] {
  return items.flatMap((item) => {
    if (item.kind === "section") return findMissingFormSurfaceRequiredFields(item.items);
    if (item.kind === "repeatable") {
      return item.items.flatMap((repeatableItem) => findMissingFormSurfaceRequiredFields(repeatableItem.items));
    }
    if (item.kind === "note" || item.kind === "groupTitle") return [];
    return isMissingRequiredField(item) ? [item.key] : [];
  });
}

export function withFormSurfaceRequiredErrors<T>(
  items: FormSurfaceItemSpec<T>[],
): FormSurfaceItemSpec<T>[] {
  return items.map((item) => {
    if (item.kind === "section") {
      return { ...item, items: withFormSurfaceRequiredErrors(item.items) };
    }
    if (item.kind === "repeatable") {
      return {
        ...item,
        items: item.items.map((repeatableItem) => ({
          ...repeatableItem,
          items: withFormSurfaceRequiredErrors(repeatableItem.items),
        })),
      };
    }
    if (item.kind === "note" || item.kind === "groupTitle" || !isMissingRequiredField(item) || item.error) return item;
    return { ...item, error: "必填" };
  });
}
