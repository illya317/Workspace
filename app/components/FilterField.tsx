"use client";

import SelectField from "./SelectField";

interface FilterFieldProps {
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
  /** 字段标签 */
  fieldLabel?: string;
  /** 值占位 */
  valuePlaceholder?: string;
}

/**
 * 二次筛选器：先选字段，再选值。
 *
 * 示例：
 *   <FilterField
 *     fields={[{key:"level",label:"层级"},{key:"type",label:"类型"}]}
 *     valueOptions={{
 *       level: [{value:"1",label:"1级"},...],
 *       type: [{value:"mapped",label:"集团"},...],
 *     }}
 *     fieldKey={filterKey}
 *     onFieldKeyChange={setFilterKey}
 *     value={filterValue}
 *     onValueChange={setFilterValue}
 *   />
 */
export default function FilterField({
  fields,
  valueOptions,
  fieldKey,
  onFieldKeyChange,
  value,
  onValueChange,
  fieldLabel,
  valuePlaceholder = "全部",
}: FilterFieldProps) {
  const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }));
  const currentOptions = valueOptions[fieldKey] || [];

  return (
    <>
      <SelectField
        label={fieldLabel}
        options={fieldOptions}
        value={fieldKey}
        onChange={(k) => {
          onFieldKeyChange(k);
          onValueChange("");
        }}
      />
      <SelectField
        options={currentOptions}
        value={value}
        onChange={onValueChange}
        placeholder={valuePlaceholder}
      />
    </>
  );
}
