"use client";

import { forwardRef, type CSSProperties, type FocusEventHandler, type KeyboardEventHandler } from "react";
import FieldInputShell, { type FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "./FormStyles";
import { joinClassNames } from "./card-utils";
import { useFieldContext } from "./field-context";

export type FieldTextAlign = "left" | "center" | "right";
export type FieldFontRole = "default" | "mono";
export type FieldVisualVariant = "default" | "inline" | "paperUnderline" | "info" | "muted" | "emphasis";
export type FieldVisualState = "default" | "error";

export interface TextFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  type?: "text" | "password" | "email" | "tel" | "url" | "number";
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  minLength?: number;
  maxLength?: number;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  ariaLabel?: string;
  dataFieldKey?: string;
  style?: CSSProperties;
  title?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  unstyled?: boolean;
  size?: FieldControlSize;
  density?: FieldInputShellProps["density"];
  textAlign?: FieldTextAlign;
  fontRole?: FieldFontRole;
  visualVariant?: FieldVisualVariant;
  state?: FieldVisualState;
}

const UNSTYLED_INPUT_CLASS_NAME =
  "h-full w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-none text-current outline-none placeholder:text-slate-400 disabled:bg-transparent disabled:text-slate-500";

const alignClass: Record<FieldTextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

const fontRoleClass: Record<FieldFontRole, string> = {
  default: "font-sans",
  mono: "font-mono",
};

function getVisualVariantClassName(variant: FieldVisualVariant, state: FieldVisualState) {
  if (variant === "inline") {
    return "min-w-0 flex-1 border-0 bg-transparent px-0 py-0 outline-none disabled:bg-transparent disabled:text-slate-500";
  }
  if (variant === "paperUnderline") {
    return "h-8 min-w-24 border-0 border-b border-slate-950 bg-transparent px-2 py-0 text-center shadow-none outline-none disabled:bg-transparent disabled:text-slate-400";
  }
  if (variant === "info") {
    return "border-sky-200 bg-white focus-within:border-sky-500 focus-within:ring-sky-500 disabled:bg-sky-100/60";
  }
  if (variant === "muted") {
    return "border-slate-200 bg-slate-100 text-slate-500";
  }
  if (variant === "emphasis") {
    return "border-2 border-emerald-500 shadow-sm focus-within:ring-2 focus-within:ring-emerald-100";
  }
  if (state === "error") {
    return "border-red-300 text-red-700 focus-within:border-red-500 focus-within:ring-red-500";
  }
  return "";
}

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    value = "",
    onChange,
    type = "text",
    placeholder,
    className,
    autoFocus,
    disabled,
    readOnly,
    required,
    min,
    max,
    step,
    minLength,
    maxLength,
    inputMode,
    ariaLabel,
    dataFieldKey,
    style,
    title,
    onKeyDown,
    onFocus,
    onBlur,
    unstyled = false,
    size,
    density,
    textAlign = "left",
    fontRole = "default",
    visualVariant = "default",
    state = "default",
  },
  ref,
) {
  const fieldContext = useFieldContext();
  const resolvedSize = size ?? fieldContext?.size ?? "md";
  const resolvedDensity = density ?? fieldContext?.density ?? "normal";
  const inputClassName = joinClassNames(
    UNSTYLED_INPUT_CLASS_NAME,
    alignClass[textAlign],
    fontRoleClass[fontRole],
    visualVariant === "paperUnderline" ? "text-sm" : "",
    unstyled ? getVisualVariantClassName(visualVariant, state) : "",
    unstyled ? className : "",
  );
  const input = (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-field-key={dataFieldKey}
      style={unstyled ? style : undefined}
      className={inputClassName}
      title={title}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      min={min}
      max={max}
      step={step}
      minLength={minLength}
      maxLength={maxLength}
      inputMode={inputMode}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
  if (unstyled) return input;
  return (
    <FieldInputShell
      disabled={disabled}
      readOnly={readOnly}
      size={resolvedSize}
      density={resolvedDensity}
      className={joinClassNames(getVisualVariantClassName(visualVariant, state), className)}
      style={style}
    >
      {input}
    </FieldInputShell>
  );
});

export default TextField;
