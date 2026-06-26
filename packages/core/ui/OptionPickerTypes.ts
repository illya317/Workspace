import type { ReactNode } from "react";

export interface PickerOption {
  label: string;
  value: string;
  description?: string;
}

export interface PickerGroupItem {
  key: string;
  label: string;
  options: PickerOption[];
}

export interface OptionPickerProps {
  value: unknown;
  options?: PickerOption[];
  groups?: PickerGroupItem[];
  disabled?: boolean;
  onChange: (value: string | null) => void;
  placeholder?: string;
  unsetLabel?: string;
  description?: ReactNode;
  emptyText?: string;
  groupLabel?: string;
  optionLabel?: string;
  changeGroupLabel?: string;
  formatValueLabel?: (value: string, option?: PickerOption, group?: PickerGroupItem) => string;
  renderOption?: (option: PickerOption, context: { selected: boolean }) => ReactNode;
  searchPlaceholder?: string;
  commonValues?: string[];
  visibleCount?: number;
  gridColumnCount?: number;
  gridColumns?: number;
  placeholderInGrid?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}
