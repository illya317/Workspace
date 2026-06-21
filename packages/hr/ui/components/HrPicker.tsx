import type { GroupedOptionPickerProps } from "@workspace/core/ui";

export interface HrPickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

export type HrGroupedPickerProps = Pick<
  GroupedOptionPickerProps,
  | "placeholder"
> & {
  groupLabel: string;
  optionLabel: string;
  changeGroupLabel: string;
};

export function hrGroupedPickerLabels(config: HrGroupedPickerProps) {
  return {
    placeholder: config.placeholder ?? "未设置",
    groupLabel: config.groupLabel,
    optionLabel: config.optionLabel,
    changeGroupLabel: config.changeGroupLabel,
  };
}
