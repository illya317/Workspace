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
  className = "grid w-full grid-cols-2 gap-2",
  optionClassName = "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 has-[:checked]:text-emerald-800 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
  markerClassName = "grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 text-xs text-transparent transition peer-checked:border-emerald-600 peer-checked:bg-emerald-600 peer-checked:text-white",
}: ChoiceGroupProps) {
  const selectedValues = type === "checkbox"
    ? new Set(value.split(",").map((item) => item.trim()).filter(Boolean))
    : new Set(value ? [value] : []);
  return (
    <span className={className}>
      {options.map((option) => {
        const choiceProps = onChange
          ? {
            checked: selectedValues.has(option),
            onChange: (event: ChangeEvent<HTMLInputElement>) => {
              if (type !== "checkbox") {
                onChange(event.target.checked ? option : "");
                return;
              }
              const next = new Set(selectedValues);
              if (event.target.checked) next.add(option);
              else next.delete(option);
              onChange(options.filter((candidate) => next.has(candidate)).join(","));
            },
          }
          : {
            defaultChecked: selectedValues.has(option),
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
