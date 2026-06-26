export interface HrPickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  /** @deprecated HR 选择输入统一由 Core InputControl 决定外观。 */
  buttonClassName?: string;
}
