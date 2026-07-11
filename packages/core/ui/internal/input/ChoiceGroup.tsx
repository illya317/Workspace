import type { ChangeEvent } from "react";

export interface ChoiceGroupProps {
  options?: string[];
  type?: "radio" | "checkbox";
  value?: string;
  name?: string;
  disabled?: boolean;
  dataFieldKey?: string;
  onChange?: (value: string) => void;
  className?: string;
  optionClassName?: string;
  markerClassName?: string;
}

export default function ChoiceGroup({
  options = [],
  type = "radio",
  value = "",
  name,
  disabled,
  dataFieldKey,
  onChange,
  className = "",
  optionClassName = "",
  markerClassName = "",
}: ChoiceGroupProps) {
  return (
    <span className={className}>
      {options.map((option) => {
        const choiceProps = onChange
          ? {
            checked: value === option,
            onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked ? option : ""),
          }
          : {
            defaultChecked: value === option,
          };
        return (
          <label key={`${dataFieldKey}-${option}`} className={optionClassName}>
            <input
              type={type}
              name={type === "radio" ? name : undefined}
              data-field-key={dataFieldKey}
              value={option}
              disabled={disabled}
              {...choiceProps}
              className="peer sr-only"
            />
            <span aria-hidden="true" className={markerClassName}>
              ✓
            </span>
            <span>{option}</span>
          </label>
        );
      })}
    </span>
  );
}
