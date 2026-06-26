"use client";

import { InputControl, type InputOption } from "@workspace/core/ui";
import { HR_SCHOOL_OPTIONS } from "@workspace/hr/constants/school-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";

const schoolOptions: InputOption[] = HR_SCHOOL_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  searchText: "aliases" in option && Array.isArray(option.aliases) ? option.aliases.join(" ") : "",
}));

export default function SchoolPicker({
  value,
  disabled,
  onChange,
  className,
}: HrPickerProps) {
  return (
    <InputControl
      spec={{
        valueType: "string",
        editor: "autocomplete",
        options: { source: "static", items: schoolOptions, visibleCount: 5 },
        state: disabled ? "disabled" : "normal",
      }}
      value={value}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
      className={className}
    />
  );
}
