"use client";

import { useMemo } from "react";
import { InputSurface } from "@workspace/core/ui";
import {
  normalizeProfessionalTitle,
  tenantHrFieldOptions,
} from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
}: HrPickerProps) {
  const options = tenantHrFieldOptions(useTenantConfig());
  const current = normalizeProfessionalTitle(value, options);
  const groups = useMemo(
    () =>
      options.professionalTitleGroups.map((group) => ({
        key: group.series,
        label: group.series,
        options: group.levels.map((item) => ({
          value: item.title,
          label: item.title,
          description: item.level,
        })),
      })),
    [options.professionalTitleGroups],
  );

  return (
    <InputSurface
      spec={{
        valueType: "string",
        control: "choice",
        options: {
          source: "grouped",
          groups,
          groupLabel: "职称系列",
          optionLabel: "职称级别",
        },
        state: disabled ? "disabled" : "normal",
      }}
      value={current}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
    />
  );
}
