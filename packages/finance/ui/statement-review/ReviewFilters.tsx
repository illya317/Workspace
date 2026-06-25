"use client";

import { CommandButton, PanelCard, SelectField } from "@workspace/core/ui";
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
  return <PanelCard bodyClassName="flex flex-wrap items-end gap-3 px-4 py-3">
      <SelectField label="公司" options={companyOptions} value={co} onChange={setCo} placeholder="—" />
      <SelectField label="年度" options={YS.map(year => ({
      value: year,
      label: year
    }))} value={yr} onChange={setYr} placeholder="—" />
      <SelectField label="月份" options={MS.map(month => ({
      value: month.v,
      label: month.l
    }))} value={mo} onChange={setMo} placeholder="—" />
      <SelectField label="报表" options={RTS.map(report => ({
      value: report.v,
      label: report.l
    }))} value={rt} onChange={setRt} placeholder="—" />
      <CommandButton variant="primary" onClick={onLoad} disabled={loading}>读取底稿</CommandButton>
    </PanelCard>;
}
