"use client";

import { SearchableOptionInput, type SearchableOption } from "@workspace/core/ui";
import { HR_SCHOOL_OPTIONS } from "@workspace/hr/constants/school-options";
import type { HrPickerProps } from "./HrPicker";

const schoolOptions: SearchableOption[] = HR_SCHOOL_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  searchText: "aliases" in option && Array.isArray(option.aliases) ? option.aliases.join(" ") : "",
}));

export default function SchoolPicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: HrPickerProps) {
  return (
    <SearchableOptionInput
      value={value}
      options={schoolOptions}
      disabled={disabled}
      onChange={(next) => onChange(next)}
      placeholder="未设置"
      emptyText="没有匹配学校"
      clearLabel="清空毕业院校"
      className={className}
      inputClassName={buttonClassName}
    />
  );
}
