"use client";

import { useMemo } from "react";
import { GroupedOptionPicker } from "@workspace/core/ui";
import {
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";
import { hrGroupedPickerLabels, type HrPickerProps } from "./HrPicker";

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
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
    <GroupedOptionPicker
      value={current}
      groups={groups}
      disabled={disabled}
      onChange={onChange}
      {...hrGroupedPickerLabels({ groupLabel: "职称系列", optionLabel: "职称级别", changeGroupLabel: "更换职称系列" })}
      className={className}
      buttonClassName={buttonClassName}
    />
  );
}
