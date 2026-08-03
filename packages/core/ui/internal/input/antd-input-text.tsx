"use client";

import { Input } from "antd";
import type { InputRef } from "antd/es/input";
import type { Ref } from "react";
import {
  normalizeInputSurfaceValue,
  resolveInputSurfaceInteractionState,
} from "./InputSurfaceTypes";
import type { FieldTextAlign } from "./TextField";
import { antdControlSize, AntdInputMarker, type AntdInputFieldProps } from "./antd-input-shared";

const TEXT_ALIGN_CLASS: Record<FieldTextAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/** legacy TextField 的 ref 是原生 input;antd InputRef 暴露 .input,适配后保持 inputRef 契约不变。 */
function adaptAntdInputRef(inputRef?: Ref<HTMLInputElement>) {
  if (!inputRef) return undefined;
  return (node: InputRef | null) => {
    const target = node?.input ?? null;
    if (typeof inputRef === "function") inputRef(target);
    else inputRef.current = target;
  };
}

/**
 * text/number 的 antd 实现。number 复用原生 type=number:legacy 逐键入输出 string,
 * InputNumber 会把 onChange 值类型改为 number|null 并吞掉中间态输入,故不采用。
 * InputMask 的 display/template 仅影响只读展示与 placeholder(与 legacy 一致),编辑期不套用。
 */
export function AntdTextField({
  spec,
  value,
  onChange,
  placeholder,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  autoFocus,
  type,
  minLength,
  maxLength,
  step,
  inputMode,
  ariaLabel,
  dataFieldKey,
  title,
  textAlign,
  visualState,
  onKeyDown,
  onBlur,
  onFocus,
  inputRef,
  className,
  style,
}: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled: disabledOverride, readOnly });
  const htmlType = type ?? (spec.control === "number" || spec.valueType === "number" ? "number" : "text");
  const required = interaction.required || spec.validation?.required || undefined;
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <Input
        ref={adaptAntdInputRef(inputRef)}
        type={htmlType}
        value={normalizeInputSurfaceValue(value)}
        disabled={interaction.disabled}
        readOnly={interaction.readOnly}
        required={required}
        autoFocus={autoFocus}
        min={spec.validation?.min}
        max={spec.validation?.max}
        step={step}
        minLength={minLength}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-label={ariaLabel}
        data-field-key={dataFieldKey}
        title={title}
        placeholder={placeholder}
        status={visualState === "error" ? "error" : undefined}
        size={antdControlSize(size)}
        className={TEXT_ALIGN_CLASS[textAlign ?? "left"]}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onFocus={onFocus}
      />
    </AntdInputMarker>
  );
}

/** textarea 的 antd 实现:autoGrow → autoSize,resize 经 style 透传。 */
export function AntdTextareaField({
  spec,
  value,
  onChange,
  placeholder,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  autoFocus,
  rows,
  autoGrow,
  maxLength,
  ariaLabel,
  dataFieldKey,
  title,
  visualState,
  resize,
  onKeyDown,
  className,
  style,
}: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled: disabledOverride, readOnly });
  const grows = autoGrow ?? true;
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <Input.TextArea
        value={normalizeInputSurfaceValue(value)}
        disabled={interaction.disabled}
        readOnly={interaction.readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        rows={rows ?? 1}
        autoSize={grows ? { minRows: rows ?? 1 } : false}
        maxLength={maxLength}
        aria-label={ariaLabel}
        data-field-key={dataFieldKey}
        title={title}
        status={visualState === "error" ? "error" : undefined}
        size={antdControlSize(size)}
        className={grows ? "resize-none overflow-y-hidden" : undefined}
        style={resize ? { resize } : undefined}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={onKeyDown as never}
      />
    </AntdInputMarker>
  );
}
