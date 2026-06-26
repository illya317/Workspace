"use client";

import { FormField, InputControl } from "@workspace/core/ui";

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
      <FormField label="公司">
        <InputControl
          spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: companies } }}
        value={company}
          onChange={(value) => onCompanyChange(String(value ?? ""))}
        placeholder="全部公司"
      />
      </FormField>
      <FormField label="年度">
        <InputControl
          spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: years } }}
        value={year}
          onChange={(value) => onYearChange(String(value ?? ""))}
      />
      </FormField>
      {showMonth && (
        <FormField label="月份">
          <InputControl
            spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: monthOptions } }}
          value={month}
            onChange={(value) => (onMonthChange ?? (() => {}))(String(value ?? ""))}
          placeholder="全部"
        />
        </FormField>
      )}
    </>
  );
}
