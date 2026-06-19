"use client";

import { FKSearchInput } from "@workspace/core/ui";
import type { FKSearchOption, LifecycleScope } from "@workspace/core/ui";

export type SearchOption = FKSearchOption;

interface Props {
  value: string;
  displayValue?: string;
  onChange: (value: string, option?: SearchOption) => void;
  entity: string;
  fkKey?: string;
  placeholder?: string;
  disabled?: boolean;
  activeOnly?: boolean;
  lifecycleScope?: LifecycleScope;
}

const ENTITY_FK_KEYS: Record<string, string> = {
  department: "hr.department",
  employee: "hr.employee",
  position: "hr.position",
  project: "work.plan",
  user: "platform.user",
};

export default function EntitySearchInput({
  value,
  displayValue,
  onChange,
  entity,
  fkKey,
  placeholder = "输入搜索...",
  disabled,
  activeOnly,
  lifecycleScope,
}: Props) {
  const resolvedFkKey = fkKey || ENTITY_FK_KEYS[entity] || entity;
  return (
    <FKSearchInput
      fkKey={resolvedFkKey}
      value={value}
      displayValue={displayValue}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      lifecycleScope={lifecycleScope || (activeOnly ? "active" : "active")}
    />
  );
}
