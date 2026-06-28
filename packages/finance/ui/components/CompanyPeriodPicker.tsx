"use client";

import { createPageBody, PageSurface, createInlineFieldsBlock } from "@workspace/core/ui";

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
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createInlineFieldsBlock("company-period", [
          {
            key: "company",
            label: "公司",
            spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: companies } },
            value: company,
            onChange: (value) => onCompanyChange(String(value ?? "")),
            placeholder: "全部公司",
          },
          {
            key: "year",
            label: "年度",
            spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: years } },
            value: year,
            onChange: (value) => onYearChange(String(value ?? "")),
          },
          ...(showMonth ? [{
            key: "month",
            label: "月份",
            spec: { valueType: "string" as const, control: "choice" as const, options: { source: "static" as const, mode: "dropdown" as const, items: monthOptions } },
            value: month,
            onChange: (value: unknown) => (onMonthChange ?? (() => {}))(String(value ?? "")),
            placeholder: "全部",
          }] : []),
        ], { kind: "filters" }),
      ])}
    />
  );
}
