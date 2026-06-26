"use client";

import { FormSurface } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
const YS = ["2024", "2025", "2026"];
const MS = Array.from({
  length: 12
}, (_, index) => ({
  v: String(index + 1),
  l: `${index + 1}月`
}));
const RTS = [{
  v: "incomeStatement",
  l: "利润表"
}, {
  v: "cashFlow",
  l: "现金流量表"
}];
interface Props {
  co: string;
  yr: string;
  mo: string;
  rt: string;
  setCo: (value: string) => void;
  setYr: (value: string) => void;
  setMo: (value: string) => void;
  setRt: (value: string) => void;
  loading: boolean;
  onLoad: () => void;
}
export default function ReviewFilters({
  co,
  yr,
  mo,
  rt,
  setCo,
  setYr,
  setMo,
  setRt,
  loading,
  onLoad
}: Props) {
  const companyOptions = useCompanyOptions();
  return <FormSurface
    kind="filters"
    fields={[
      { key: "company", label: "公司", spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: companyOptions } }, value: co, onChange: (value) => setCo(String(value ?? "")), placeholder: "—" },
      { key: "year", label: "年度", spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: YS.map(year => ({ value: year, label: year })) } }, value: yr, onChange: (value) => setYr(String(value ?? "")), placeholder: "—" },
      { key: "month", label: "月份", spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: MS.map(month => ({ value: month.v, label: month.l })) } }, value: mo, onChange: (value) => setMo(String(value ?? "")), placeholder: "—" },
      { key: "report", label: "报表", spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: RTS.map(report => ({ value: report.v, label: report.l })) } }, value: rt, onChange: (value) => setRt(String(value ?? "")), placeholder: "—" },
    ]}
    actions={[{ key: "load", label: "读取底稿", variant: "primary", onClick: onLoad, disabled: loading }]}
  />;
}
