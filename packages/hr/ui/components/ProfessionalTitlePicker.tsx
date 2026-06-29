"use client";

import { useMemo } from "react";
import { InputSurface } from "@workspace/core/ui";
import {
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
}: HrPickerProps) {
  const current = normalizeProfessionalTitle(value);
  const groups = useMemo(
    () =>
      HR_PROFESSIONAL_TITLE_GROUPS.map((group) => ({
        key: group.series,
        label: group.series,
        options: group.levels.map((item) => ({
          value: item.title,
          label: item.title,
          description: item.level,
        })),
      })),
    [],
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
          changeGroupLabel: "更换职称系列",
        },
        state: disabled ? "disabled" : "normal",
      }}
      value={current}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
    />
  );
}
