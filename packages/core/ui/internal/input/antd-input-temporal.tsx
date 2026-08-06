"use client";

import { DatePicker, InputNumber, TimePicker } from "antd";
import {
  formatInputSurfaceValue,
  normalizeInputSurfaceValue,
  resolveInputSurfaceInteractionState,
} from "./InputSurfaceTypes";
import {
  antdControlSize,
  AntdInputMarker,
  parseAntdDateValue,
  parseAntdTimeValue,
  type AntdInputFieldProps,
} from "./antd-input-shared";

/** percent 的 antd 实现:与 legacy PercentField 相同的默认值(min 0/max 100/step 0.01)与 number|null onChange 契约。 */
export function AntdPercentField({
  spec,
  value,
  onChange,
  placeholder,
  size,
  density,
  step,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled: disabledOverride, readOnly });
  const numeric = value === null || value === undefined || value === "" ? null : Number(value);
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <InputNumber
        value={Number.isFinite(numeric) ? numeric : null}
        min={spec.validation?.min ?? 0}
        max={spec.validation?.max ?? 100}
        step={step ?? 0.01}
        disabled={interaction.disabled || interaction.readOnly}
        placeholder={placeholder ?? "输入完成度"}
        suffix="%"
        size={antdControlSize(size)}
        aria-label={ariaLabel}
        onChange={(next) => onChange?.(next)}
      />
    </AntdInputMarker>
  );
}

/**
 * date 的 antd 实现:值契约保持 YYYY-MM-DD/YYYY-MM 字符串;legacy 输入框恒定只读(仅日历选择),
 * 故 inputReadOnly 恒真;readOnly 状态禁止打开面板(open=false);mask/displayValue 经 format 函数保留。
 */
export function AntdDateField({
  spec,
  value,
  displayValue,
  onChange,
  placeholder,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  visualState,
  className,
  style,
}: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled: disabledOverride, readOnly });
  const precision = spec.precision === "month" ? "month" : "date";
  const formatString = precision === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const maskedDisplayValue = displayValue
    ?? (spec.mask ? String(formatInputSurfaceValue(value, spec) || "") : undefined);
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <DatePicker
        picker={precision}
        value={parseAntdDateValue(normalizeInputSurfaceValue(value), precision)}
        minDate={parseAntdDateValue(spec.validation?.minDate ?? "", "date")}
        maxDate={parseAntdDateValue(spec.validation?.maxDate ?? "", "date")}
        disabled={interaction.disabled}
        inputReadOnly
        open={interaction.readOnly ? false : undefined}
        aria-readonly={interaction.readOnly || undefined}
        allowClear={!interaction.readOnly}
        placeholder={placeholder ?? (precision === "month" ? "选择月份" : "选择日期")}
        format={maskedDisplayValue ? () => maskedDisplayValue : formatString}
        status={visualState === "error" ? "error" : undefined}
        size={antdControlSize(size)}
        aria-label={ariaLabel}
        className="w-full"
        onChange={(date) => onChange?.(date ? date.format(formatString) : null)}
      />
    </AntdInputMarker>
  );
}

/** time 的 antd 实现:值契约保持 HH:mm 字符串(清空为 null),readOnly 状态禁止编辑与打开面板。 */
export function AntdTimeField({
  spec,
  value,
  onChange,
  placeholder,
  size,
  density,
  disabled: disabledOverride,
  readOnly,
  ariaLabel,
  dataFieldKey,
  title,
  className,
  style,
}: AntdInputFieldProps) {
  const interaction = resolveInputSurfaceInteractionState(spec.state, { disabled: disabledOverride, readOnly });
  return (
    <AntdInputMarker className={className} dataFieldKey={dataFieldKey} density={density} style={style} title={title}>
      <TimePicker
        value={parseAntdTimeValue(normalizeInputSurfaceValue(value))}
        format="HH:mm"
        disabled={interaction.disabled}
        inputReadOnly={interaction.readOnly}
        open={interaction.readOnly ? false : undefined}
        allowClear={!interaction.readOnly}
        placeholder={placeholder}
        size={antdControlSize(size)}
        aria-label={ariaLabel}
        onChange={(time) => onChange?.(time ? time.format("HH:mm") : null)}
      />
    </AntdInputMarker>
  );
}
