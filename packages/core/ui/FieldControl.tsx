"use client";

import InputControl, { type InputFieldSpec } from "./InputControl";
import type { ConfirmOptions } from "./FeedbackProvider";
import type { FkFieldOption, FkFieldInputProps } from "./FkFieldInput";
import type { FieldControlSize } from "./FormStyles";
import type { SelectFieldOption } from "./SelectField";

export type FieldControlKind = "text" | "readonly" | "fk" | "tags" | "select";

const FORBIDDEN_FIELD_CLASS_PREFIXES = new Set([
  "h-",
  "min-h-",
  "max-h-",
  "p-",
  "px-",
  "py-",
  "pt-",
  "pb-",
  "pl-",
  "pr-",
  "leading-",
  "border",
  "rounded",
  "shadow",
  "outline",
  "ring",
]);

function sanitizeFieldControlClassName(className?: string): string | undefined {
  if (!className) return undefined;
  const classes = className.split(/\s+/).filter(Boolean);
  const allowed = classes.filter((cls) => {
    const base = cls.split(":").pop() ?? cls;
    return ![...FORBIDDEN_FIELD_CLASS_PREFIXES].some((prefix) => base.startsWith(prefix));
  });
  return allowed.length > 0 ? allowed.join(" ") : undefined;
}

export interface FieldControlProps {
  kind: FieldControlKind;
  value?: unknown;
  onChange?: (value: string, option?: FkFieldOption) => void;
  disabled?: boolean;
  placeholder?: string;
  options?: SelectFieldOption[];
  searchable?: boolean;
  fkKey?: FkFieldInputProps["fkKey"];
  endpoint?: FkFieldInputProps["endpoint"];
  displayValue?: string;
  className?: string;
  confirmDelete?: (options?: Partial<ConfirmOptions>) => Promise<boolean>;
  confirmRemove?: boolean;
  removeConfirmMessage?: (item: string) => string;
  removeConfirmTitle?: string;
  size?: FieldControlSize;
  density?: "normal" | "compact";
}

function toSpec({
  kind,
  disabled,
  options,
  searchable,
  fkKey,
  endpoint,
}: Pick<FieldControlProps, "kind" | "disabled" | "options" | "searchable" | "fkKey" | "endpoint">): InputFieldSpec {
  const state = disabled ? "disabled" : "normal";
  switch (kind) {
    case "readonly":
      return { valueType: "string", editor: "input", state: "readonly" };
    case "fk":
      return fkKey && endpoint
        ? { valueType: "reference", editor: "autocomplete", options: { source: "remote", fkKey, endpoint }, state }
        : { valueType: "string", editor: "input", state: "readonly" };
    case "tags":
      return { valueType: "array", editor: "tags", state };
    case "select":
      return {
        valueType: "string",
        editor: searchable || (options?.length ?? 0) > 8 ? "autocomplete" : "select",
        options: { source: "static", items: options ?? [] },
        state,
      };
    case "text":
    default:
      return { valueType: "string", editor: "input", state };
  }
}

export default function FieldControl(props: FieldControlProps) {
  const spec = toSpec(props);
  const value = props.kind === "fk" && props.displayValue ? props.displayValue : props.value;
  return (
    <InputControl
      spec={spec}
      value={value}
      placeholder={props.placeholder}
      onChange={(next, option) => props.onChange?.(String(next ?? ""), option as FkFieldOption | undefined)}
      className={sanitizeFieldControlClassName(props.className)}
      confirmDelete={props.confirmDelete}
      confirmRemove={props.confirmRemove}
      removeConfirmMessage={props.removeConfirmMessage}
      removeConfirmTitle={props.removeConfirmTitle}
      size={props.size}
      density={props.density}
    />
  );
}

export { sanitizeFieldControlClassName };
