"use client";

import OptionPicker from "./OptionPicker";
import { HR_COMMON_ETHNICITIES, HR_ETHNICITIES } from "@workspace/hr/constants/field-options";

interface EthnicityPickerProps {
  value: unknown;
  disabled?: boolean;
  onChange: (value: string | null) => void;
  className?: string;
  buttonClassName?: string;
}

export default function EthnicityPicker({
  value,
  disabled,
  onChange,
  className,
  buttonClassName,
}: EthnicityPickerProps) {
  return (
    <OptionPicker
      value={value}
      disabled={disabled}
      onChange={onChange}
      className={className}
      buttonClassName={buttonClassName}
      commonValues={HR_COMMON_ETHNICITIES}
      options={HR_ETHNICITIES.map((item) => ({ label: item, value: item }))}
      searchPlaceholder="搜索民族"
    />
  );
}
