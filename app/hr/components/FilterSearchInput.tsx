"use client";

import EntitySearchInput, { type SearchOption } from "./EntitySearchInput";
import type { SearchInputSize } from "@workspace/core/ui";

interface Props {
  value: string;
  onChange: (value: string) => void;
  entity: string;
  fkKey?: string;
  returnField?: "id" | "name";
  placeholder?: string;
  size?: SearchInputSize;
  className?: string;
}

export default function FilterSearchInput({
  value,
  onChange,
  entity,
  fkKey,
  returnField = "name",
  placeholder = "输入搜索...",
  size,
  className,
}: Props) {
  function handleChange(val: string, option?: SearchOption) {
    if (option && returnField === "id") {
      onChange(String(option.id));
    } else {
      onChange(val);
    }
  }

  return (
    <EntitySearchInput
      value={value}
      onChange={handleChange}
      entity={entity}
      fkKey={fkKey}
      placeholder={placeholder}
      size={size}
      className={className}
    />
  );
}
