"use client";

import { FKSearchInput } from "@workspace/core/ui";
import type { FKOption } from "@workspace/hr/types";

interface FKInputProps {
  value: number | null;
  displayValue: string;
  onChange: (option: FKOption | null) => void;
  entity: string;
  fkKey?: string;
  disabled?: boolean;
  placeholder?: string;
}

const ENTITY_FK_KEYS: Record<string, string> = {
  company: "hr.company",
  department: "hr.department",
  employee: "hr.employee",
  position: "hr.position",
  positionDescription: "hr.positionDescription",
  project: "work.plan",
  user: "platform.user",
};

export default function FKInput({
  value,
  displayValue,
  onChange,
  entity,
  fkKey,
  disabled,
  placeholder = "输入搜索...",
}: FKInputProps) {
  const resolvedFkKey = fkKey || ENTITY_FK_KEYS[entity] || entity;
  return (
    <FKSearchInput
      fkKey={resolvedFkKey}
      value={value ? String(value) : ""}
      displayValue={displayValue}
      onChange={(_label, option) => onChange(option ? { id: option.id, name: option.name, subtitle: option.subtitle } : null)}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
