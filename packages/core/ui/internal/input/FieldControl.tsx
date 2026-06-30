"use client";

import InputSurface, { type InputFieldSpec } from "../../InputSurface";
import type { ConfirmOptions } from "../../services/FeedbackProvider";
import type { FkFieldOption, FkFieldInputProps } from "./FkFieldInput";
import type { InputOption } from "./InputSurfaceTypes";
import type { FieldControlSize } from "../form/FormStyles";

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
  options?: InputOption[];
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
      return { valueType: "string", control: "text", state: "readonly" };
    case "fk":
      return fkKey && endpoint
        ? { valueType: "reference", control: "reference", options: { source: "remote", fkKey, endpoint }, state }
        : { valueType: "string", control: "text", state: "readonly" };
    case "tags":
      return { valueType: "array", control: "collection", itemControl: "text", state };
    case "select":
      return {
        valueType: "string",
        control: "choice",
        options: { source: "static", mode: searchable || (options?.length ?? 0) > 8 ? "autocomplete" : "dropdown", items: options ?? [] },
        state,
      };
    case "text":
    default:
      return { valueType: "string", control: "text", state };
  }
}

export default function FieldControl(props: FieldControlProps) {
  const spec = toSpec(props);
  const value = props.kind === "fk" && props.displayValue ? props.displayValue : props.value;
  return (
    <InputSurface
      spec={spec}
      value={value}
      placeholder={props.placeholder}
      onChange={(next, option) => props.onChange?.(String(next ?? ""), option as FkFieldOption | undefined)}
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
