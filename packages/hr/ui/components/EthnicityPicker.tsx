"use client";

import { InputSurface } from "@workspace/core/ui";
import { tenantHrFieldOptions } from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

export default function EthnicityPicker({
  value,
  disabled,
  onChange,
}: HrPickerProps) {
  const options = tenantHrFieldOptions(useTenantConfig());
  return (
    <InputSurface
      spec={{
        valueType: "string",
        control: "choice",
        options: {
          source: "static",
          items: options.ethnicities.map((item) => ({ label: item, value: item })),
          commonValues: options.commonEthnicities,
          searchPlaceholder: "搜索民族",
        },
        state: disabled ? "disabled" : "normal",
      }}
      value={value}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
    />
  );
}
