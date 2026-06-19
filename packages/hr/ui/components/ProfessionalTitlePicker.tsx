"use client";

import { useMemo } from "react";
import { GroupedOptionPicker } from "@workspace/core/ui";
import {
  HR_PROFESSIONAL_TITLE_GROUPS,
  normalizeProfessionalTitle,
} from "@workspace/hr/constants/field-options";

interface ProfessionalTitlePickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

export default function ProfessionalTitlePicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: ProfessionalTitlePickerProps) {
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
      placeholder="未设置"
      groupLabel="职称系列"
      optionLabel="职称级别"
      changeGroupLabel="更换职称系列"
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(30rem,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
    />
  );
}
