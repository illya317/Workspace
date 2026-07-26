"use client";

import { useMemo } from "react";
import { InputSurface, type InputOption } from "@workspace/core/ui";
import { HR_MAJOR_OPTIONS, normalizeHrMajorItems, type HRMajorItem } from "@workspace/hr/constants/field-options";
import type { HrPickerProps } from "@workspace/hr/types/hr-picker";

function currentMajor(value: unknown): HRMajorItem | undefined {
  return normalizeHrMajorItems(value)[0];
}

export default function MajorPicker({
  value,
  disabled,
  onChange,
}: HrPickerProps) {
  const current = useMemo(() => currentMajor(value), [value]);
  const options = useMemo<InputOption[]>(
    () => HR_MAJOR_OPTIONS.map((option) => ({
      value: option.specialty,
      label: option.specialty,
      subtitle: option.category,
      searchText: option.category,
    })),
    [],
  );

  return (
    <InputSurface
      value={current?.specialty ?? ""}
      onChange={(next) => onChange(next === null || next === undefined || next === "" ? null : String(next))}
      placeholder="未设置"
      size="md"
      density="normal"
      spec={{
        valueType: "string",
        control: "choice",
        options: { source: "static", items: options, visibleCount: 5 },
        state: disabled ? "disabled" : "normal",
      }}
    />
  );
}
