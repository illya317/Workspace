export interface SelectionOption {
  label: string;
  value: string;
  description?: string;
}

export interface SelectionOptionGroup {
  key: string;
  label: string;
  options: SelectionOption[];
}
