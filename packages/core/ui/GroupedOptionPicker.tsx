"use client";

import Picker, {
  type PickerGroupItem,
  type PickerOptionItem,
  type PickerProps,
} from "./Picker";

export type GroupedPickerOption = PickerOptionItem;
export type GroupedPickerGroup = PickerGroupItem;

export interface GroupedOptionPickerProps
  extends Omit<PickerProps, "options" | "groups" | "formatValueLabel"> {
  groups: GroupedPickerGroup[];
  formatValueLabel?: (
    value: string,
    option?: GroupedPickerOption,
    group?: GroupedPickerGroup,
  ) => string;
  /** @deprecated Use gridColumns on Picker instead. */
  groupColumnsClassName?: string;
  /** @deprecated Use gridColumns on Picker instead. */
  optionColumnsClassName?: string;
}

export default function GroupedOptionPicker(props: GroupedOptionPickerProps) {
  const {
    groups,
    formatValueLabel,
    groupColumnsClassName: _groupColumnsClassName,
    optionColumnsClassName: _optionColumnsClassName,
    ...pickerProps
  } = props;

  return (
    <Picker
      {...pickerProps}
      groups={groups}
      formatValueLabel={formatValueLabel}
    />
  );
}
