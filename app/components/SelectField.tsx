"use client";

interface SelectFieldProps {
  /** 标签文字，不传则不显示 label */
  label?: string;
  /** 下拉选项 */
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** 占位选项（value=""），不传则不显示 */
  placeholder?: string;
  className?: string;
}

/**
 * 通用下拉选择器。
 * 不知道公司、年份、状态等业务含义——只负责 label + select + options。
 */
export default function SelectField({
  label,
  options,
  value,
  onChange,
  placeholder,
  className,
}: SelectFieldProps) {
  return (
    <label className={`flex items-center gap-1.5 text-xs ${className ?? ""}`}>
      {label && <span className="text-gray-500">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-200 px-1.5 py-1 text-xs focus:border-emerald-400 focus:outline-none"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
