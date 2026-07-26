"use client";

import { InputSurface, type InputOption } from "@workspace/core/ui";
import { tenantHrSchoolOptions } from "@workspace/hr/constants/school-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

export default function SchoolPicker({
  value,
  disabled,
  onChange,
}: HrPickerProps) {
  const schoolOptions: InputOption[] = tenantHrSchoolOptions(useTenantConfig().hrCatalogs).map((option) => ({
    value: option.value,
    label: option.label,
    searchText: "aliases" in option && Array.isArray(option.aliases) ? option.aliases.join(" ") : "",
  }));
  return (
    <InputSurface
      spec={{
        valueType: "string",
        control: "choice",
        options: { source: "static", items: schoolOptions, visibleCount: 5 },
        state: disabled ? "disabled" : "normal",
      }}
      value={value}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
    />
  );
}
