"use client";

import { FkFieldInput } from "@workspace/core/ui";
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
    <FkFieldInput
      fkKey={resolvedFkKey}
      endpoint={HR_REFERENCE_OPTIONS_ENDPOINT}
      value={value ? String(value) : ""}
      displayValue={displayValue}
      onChange={(_label, option) => onChange(option ? { id: option.id, name: option.name, subtitle: option.subtitle } : null)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
