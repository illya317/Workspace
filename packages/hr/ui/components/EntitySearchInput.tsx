"use client";

import { FKSearchInput } from "@workspace/core/ui";
import type { FKSearchOption, LifecycleScope, SearchInputSize } from "@workspace/core/ui";

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
  size?: SearchInputSize;
  className?: string;
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
  size,
  className,
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
      size={size}
      className={className}
    />
  );
}
