"use client";

import type { ReactNode } from "react";
import FkFieldInput, { type FkFieldInputProps, type FkFieldOption } from "./FkFieldInput";
import ReadOnlyField from "./ReadOnlyField";
import SelectField, { type SelectFieldOption } from "./SelectField";
import TagStringInput from "./TagStringInput";
import TextField from "./TextField";
import type { FieldControlSize } from "./FormStyles";

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

/**
 * 业务侧通过 className 只能调整颜色、宽度、flex 布局等不影响字段壳视觉规范的属性。
 * 高度、padding、行高、边框、圆角、阴影、焦点环必须由 FieldShell 统一控制。
 */
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
  /** kind="select" 时使用 */
  options?: SelectFieldOption[];
  /** kind="select" 且需要搜索时使用 */
  searchable?: boolean;
  /** kind="fk" 时使用 */
  fkKey?: FkFieldInputProps["fkKey"];
  /** kind="fk" 时使用 */
  endpoint?: FkFieldInputProps["endpoint"];
  /** kind="fk" 时展示文本 */
  displayValue?: string;
  className?: string;
  /** kind="tags" 时删除是否需要确认 */
  confirmRemove?: boolean;
  /** kind="tags" 时自定义删除确认文案 */
  removeConfirmMessage?: (item: string) => string;
  /** kind="tags" 时删除确认弹窗标题 */
  removeConfirmTitle?: string;
  size?: FieldControlSize;
  density?: "normal" | "compact";
}

/**
 * 统一字段输入控件。
 *
 * 只负责按 kind 渲染正确的输入组件，并保持同一套输入框高度、边框、焦点环。
 * 不包含 label 和网格布局，需要和 FieldGrid.Cell 或 EntityDetailLayout 配合使用。
 */
export default function FieldControl({
  kind,
  value,
  onChange,
  disabled,
  placeholder,
  options,
  searchable,
  fkKey,
  endpoint,
  displayValue,
  className,
  confirmRemove,
  removeConfirmMessage,
  removeConfirmTitle,
  size = "md",
  density = "normal",
}: FieldControlProps) {
  const stringValue = value == null ? "" : String(value);
  const safeClassName = sanitizeFieldControlClassName(className);

  switch (kind) {
    case "readonly":
      return (
        <ReadOnlyField
          value={value as ReactNode}
          disabled={disabled}
          placeholder={placeholder}
          className={safeClassName}
          size={size}
          density={density}
        />
      );
    case "fk":
      if (!fkKey || !endpoint) {
        return (
          <ReadOnlyField
            value={displayValue || stringValue}
            disabled={disabled}
            placeholder={placeholder}
            className={safeClassName}
            size={size}
            density={density}
          />
        );
      }
      return (
        <FkFieldInput
          fkKey={fkKey}
          endpoint={endpoint}
          value={stringValue}
          displayValue={displayValue}
          disabled={disabled}
          placeholder={placeholder}
          onChange={onChange as FkFieldInputProps["onChange"]}
          className={safeClassName}
          size={size}
          density={density}
        />
      );
    case "tags":
      return (
        <TagStringInput
          value={stringValue}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(next) => onChange?.(next)}
          className={safeClassName}
          confirmRemove={confirmRemove}
          removeConfirmMessage={removeConfirmMessage}
          removeConfirmTitle={removeConfirmTitle}
          size={size}
          density={density}
        />
      );
    case "select":
      return (
        <SelectField
          value={stringValue}
          options={options ?? []}
          disabled={disabled}
          placeholder={placeholder}
          searchable={searchable}
          onChange={(next) => onChange?.(next)}
          className={safeClassName}
          size={size}
          density={density}
        />
      );
    case "text":
    default:
      return (
        <TextField
          value={stringValue}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(next) => onChange?.(next)}
          className={safeClassName}
          size={size}
          density={density}
        />
      );
  }
}

export { sanitizeFieldControlClassName };
