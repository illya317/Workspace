"use client";

import { useMemo } from "react";
import { OptionPicker } from "@workspace/core/ui";
import { hrGroupedPickerLabels, type HrPickerProps } from "./HrPicker";

interface RankPickerProps extends HrPickerProps {
  options: string[];
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function parseRank(rank: string) {
  const match = rank.match(/^([MPT])(\d+)$/);
  if (!match) return null;
  return { group: match[1], level: match[2] };
}

export default function RankPicker({
  value,
  options,
  disabled,
  onChange,
  className,
  buttonClassName,
}: RankPickerProps) {
  const current = normalizeValue(value);
  const groups = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const option of options) {
      const parsed = parseRank(option);
      if (!parsed) continue;
      const list = grouped.get(parsed.group) ?? [];
      list.push(parsed.level);
      grouped.set(parsed.group, list);
    }
    return ["M", "P", "T"]
      .filter((key) => grouped.has(key))
      .map((key) => ({
        key,
        label: key,
        options: [...(grouped.get(key) ?? [])]
          .sort((a, b) => Number(a) - Number(b))
          .map((level) => ({
            value: `${key}${level}`,
            label: level,
          })),
      }));
  }, [options]);

  return (
    <OptionPicker
      value={current}
      groups={groups}
      disabled={disabled}
      onChange={onChange}
      {...hrGroupedPickerLabels({ groupLabel: "职级序列", optionLabel: "等级", changeGroupLabel: "更换序列" })}
      className={className}
      buttonClassName={buttonClassName}
      formatValueLabel={(nextValue) => nextValue}
    />
  );
}
