"use client";

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
      {/* 字段选择 — 灰色背景，无框无箭头 */}
      <select
        value={fieldKey}
        onChange={(e) => {
          onFieldKeyChange(e.target.value);
          onValueChange("");
        }}
        className="appearance-none bg-gray-50 rounded-l border border-gray-200 px-1.5 py-1 text-gray-600 text-right cursor-pointer focus:outline-none"
      >
        {fieldOptions.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      {/* 值选择 — 正常框，左框线合并 */}
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="rounded-r border border-l-0 border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none focus:z-10"
      >
        {currentOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </span>
  );
}
