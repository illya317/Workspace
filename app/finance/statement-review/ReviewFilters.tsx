"use client";

import { PanelCard, SelectField } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";

const YS = ["2024", "2025", "2026"];
const MS = Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}月` }));
const RTS = [{ v: "incomeStatement", l: "利润表" }, { v: "cashFlow", l: "现金流量表" }];

interface Props {
  co: string; yr: string; mo: string; rt: string;
  setCo: (v: string) => void; setYr: (v: string) => void; setMo: (v: string) => void; setRt: (v: string) => void;
  loading: boolean; onLoad: () => void;
}

export default function ReviewFilters({ co, yr, mo, rt, setCo, setYr, setMo, setRt, loading, onLoad }: Props) {
  const companyOptions = useCompanyOptions();
  return (
    <PanelCard bodyClassName="flex flex-wrap items-end gap-3 px-4 py-3">
      <SelectField label="公司" options={companyOptions} value={co} onChange={setCo} placeholder="—" />
      <SelectField label="年度" options={YS.map(y => ({ value: y, label: y }))} value={yr} onChange={setYr} placeholder="—" />
      <SelectField label="月份" options={MS.map(m => ({ value: m.v, label: m.l }))} value={mo} onChange={setMo} placeholder="—" />
      <SelectField label="报表" options={RTS.map(r => ({ value: r.v, label: r.l }))} value={rt} onChange={setRt} placeholder="—" />
      <button onClick={onLoad} disabled={loading} className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">读取底稿</button>
    </PanelCard>
  );
}
