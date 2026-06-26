"use client";

import { useMemo } from "react";
import { InputControl } from "@workspace/core/ui";
import {
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
  className,
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
    <InputControl
      spec={{
        valueType: "string",
        editor: "select",
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
      className={className}
      placeholder="未设置"
    />
  );
}
