"use client";

import { InputControl } from "@workspace/core/ui";
import { HR_COMMON_ETHNICITIES, HR_ETHNICITIES } from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";

export default function EthnicityPicker({
  value,
  disabled,
  onChange,
  className,
}: HrPickerProps) {
  return (
    <InputControl
      spec={{
        valueType: "string",
        control: "choice",
        options: {
          source: "static",
          items: HR_ETHNICITIES.map((item) => ({ label: item, value: item })),
          commonValues: HR_COMMON_ETHNICITIES,
          searchPlaceholder: "搜索民族",
        },
        state: disabled ? "disabled" : "normal",
      }}
      value={value}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      className={className}
      placeholder="未设置"
    />
  );
}
