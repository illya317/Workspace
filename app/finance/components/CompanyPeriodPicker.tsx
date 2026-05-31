"use client";

import SelectField from "@/app/components/SelectField";

interface CompanyPeriodPickerProps {
  company: string;
  year: string;
  month?: string;
  onCompanyChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onMonthChange?: (value: string) => void;
  showMonth?: boolean;
  companies: { value: string; label: string }[];
  years: { value: string; label: string }[];
  months?: { value: string; label: string }[];
}

/**
 * 公司+年+月组合选择器。
 * 财务全域复用的三联动下拉，内部用 SelectField 拼装。
 */
export default function CompanyPeriodPicker({
  company,
  year,
  month = "",
  onCompanyChange,
  onYearChange,
  onMonthChange,
  showMonth = true,
  companies,
  years,
  months,
}: CompanyPeriodPickerProps) {
  const monthOptions =
    months ??
    Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1}月`,
    }));

  return (
    <>
      <SelectField
        label="公司"
        options={companies}
        value={company}
        onChange={onCompanyChange}
        placeholder="全部公司"
      />
      <SelectField
        label="年度"
        options={years}
        value={year}
        onChange={onYearChange}
      />
      {showMonth && (
        <SelectField
          label="月份"
          options={monthOptions}
          value={month}
          onChange={onMonthChange ?? (() => {})}
          placeholder="全部"
        />
      )}
    </>
  );
}
