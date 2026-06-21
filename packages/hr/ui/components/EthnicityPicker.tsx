"use client";

import { OptionPicker } from "@workspace/core/ui";
import { HR_COMMON_ETHNICITIES, HR_ETHNICITIES } from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "./HrPicker";

export default function EthnicityPicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: HrPickerProps) {
  return (
    <OptionPicker
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={className}
      buttonClassName={buttonClassName}
      commonValues={HR_COMMON_ETHNICITIES}
      options={HR_ETHNICITIES.map((item) => ({ label: item, value: item }))}
      searchPlaceholder="搜索民族"
    />
  );
}
