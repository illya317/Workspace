"use client";

import { SelectField } from "@workspace/core/ui";

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
    Array.from({ length: 12 }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1}月`,
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
