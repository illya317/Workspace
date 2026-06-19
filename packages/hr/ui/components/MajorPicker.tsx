"use client";

import { useMemo } from "react";
import { GroupedOptionPicker } from "@workspace/core/ui";
import {
  HR_MAJOR_GROUPS,
  isValidHrMajorItem,
  normalizeHrMajorItems,
  serializeHrMajorItems,
  type HRMajorItem,
} from "@workspace/hr/constants/field-options";

interface MajorPickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

function currentMajor(value: unknown): HRMajorItem | undefined {
  return normalizeHrMajorItems(value).find(isValidHrMajorItem);
}

function itemValue(item: HRMajorItem) {
  return serializeHrMajorItems([item]) ?? "";
}

export default function MajorPicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: MajorPickerProps) {
  const current = useMemo(() => currentMajor(value), [value]);
  const groups = useMemo(
    () =>
      HR_MAJOR_GROUPS.map((group) => ({
        key: group.category,
        label: group.category,
        options: group.specialties.map((specialty) => ({
          value: itemValue({ category: group.category, specialty }),
          label: specialty,
        })),
      })),
    [],
  );

  return (
    <GroupedOptionPicker
      value={current ? itemValue(current) : null}
      groups={groups}
      disabled={disabled}
      onChange={onChange}
      placeholder="未设置"
      groupLabel="学科门类"
      optionLabel="专业类"
      changeGroupLabel="更换学科门类"
      className={className}
      buttonClassName={buttonClassName}
      popoverClassName="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-[min(34rem,calc(100vw-3rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
      groupColumnsClassName="grid-cols-3"
      optionColumnsClassName="grid-cols-2 md:grid-cols-3"
    />
  );
}
