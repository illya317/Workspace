"use client";

import EntitySearchInput, { type SearchOption } from "./EntitySearchInput";

interface Props {
  value: string;
  onChange: (value: string) => void;
  entity: string;
  returnField?: "id" | "name";
  placeholder?: string;
}

export default function FilterSearchInput({
  value,
  onChange,
  entity,
  returnField = "name",
  placeholder = "输入搜索...",
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
      placeholder={placeholder}
    />
  );
}
