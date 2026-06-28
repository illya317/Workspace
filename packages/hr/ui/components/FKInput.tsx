"use client";

import { InputControl, type ReferenceOption } from "@workspace/core/ui";
import type { FKOption } from "@workspace/hr/types";
import { HR_REFERENCE_OPTIONS_ENDPOINT, fkKeyForEntity } from "../fk-keys";

interface FKInputProps {
  value: number | null;
  displayValue: string;
  onChange: (option: FKOption | null) => void;
  entity: string;
  fkKey?: string;
  disabled?: boolean;
  placeholder?: string;
}

export default function FKInput({
  value,
  displayValue,
  onChange,
  entity,
  fkKey,
  disabled,
  placeholder = "输入搜索...",
}: FKInputProps) {
  const resolvedFkKey = fkKeyForEntity(entity, fkKey);
  return (
    <InputControl
      spec={{
        valueType: "reference",
        control: "reference",
        state: disabled ? "disabled" : "normal",
        options: { source: "remote", fkKey: resolvedFkKey, endpoint: HR_REFERENCE_OPTIONS_ENDPOINT, returnField: "id" },
      }}
      value={value ? String(value) : ""}
      displayValue={displayValue}
      onChange={(_label, option) => {
        const fkOption = option as ReferenceOption | undefined;
        onChange(fkOption ? { id: fkOption.id, name: fkOption.name, subtitle: fkOption.subtitle } : null);
      }}
      placeholder={placeholder}
    />
  );
}
