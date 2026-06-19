"use client";

import SelectField from "./SelectField";

export interface FilterFieldProps {
  /** 可选字段列表 */
  fields: { key: string; label: string }[];
  /** 每个字段对应的值选项 */
  valueOptions: Record<string, { value: string; label: string }[]>;
  /** 当前选中的字段 */
  fieldKey: string;
  onFieldKeyChange: (key: string) => void;
  /** 当前选中的值 */
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * 二次筛选器：先选字段，再选值。
 * 渲染为紧贴的 [字段][值] 组合下拉。
 */
export default function FilterField({
  fields,
  valueOptions,
  fieldKey,
  onFieldKeyChange,
  value,
  onValueChange,
}: FilterFieldProps) {
  const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }));
  const currentOptions = valueOptions[fieldKey] || [];

  return (
    <span className="inline-flex items-center text-xs">
      <SelectField
        value={fieldKey}
        onChange={(nextKey) => {
          onFieldKeyChange(nextKey);
          onValueChange("");
        }}
        options={fieldOptions}
        className="w-auto"
        selectClassName="min-h-7 rounded-r-none bg-gray-50 text-center text-gray-600 shadow-none"
      />
      <SelectField
        value={value}
        onChange={onValueChange}
        options={currentOptions}
        className="w-auto"
        selectClassName="min-h-7 rounded-l-none border-l-0 shadow-none"
      />
    </span>
  );
}
