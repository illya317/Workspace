"use client";

export interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export default function CheckboxField({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
}: CheckboxFieldProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
      className={`h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 ${className}`}
    />
  );
}
