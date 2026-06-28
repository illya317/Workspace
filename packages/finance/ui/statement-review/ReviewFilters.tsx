"use client";

import type { SurfaceToolbarItems } from "@workspace/core/ui";
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
  extraItems?: SurfaceToolbarItems;
}
export function useReviewFilterToolbarItems({
  co,
  yr,
  mo,
  rt,
  setCo,
  setYr,
  setMo,
  setRt,
  loading,
  onLoad,
  extraItems = [],
}: Props) {
  const companyOptions = useCompanyOptions();
  const items: SurfaceToolbarItems = [
    { kind: "select", key: "company", section: "filter", label: "公司", options: companyOptions, value: co, onChange: setCo, placeholder: "—" },
    { kind: "select", key: "year", section: "filter", label: "年度", options: YS.map(year => ({ value: year, label: year })), value: yr, onChange: setYr, placeholder: "—" },
    { kind: "select", key: "month", section: "filter", label: "月份", options: MS.map(month => ({ value: month.v, label: month.l })), value: mo, onChange: setMo, placeholder: "—" },
    { kind: "select", key: "report", section: "filter", label: "报表", options: RTS.map(report => ({ value: report.v, label: report.l })), value: rt, onChange: setRt, placeholder: "—" },
    { kind: "action-group", key: "load", section: "action", actions: [{ key: "load", label: "读取底稿", kind: "view", variant: "primary", onClick: onLoad, disabled: loading }] },
    ...extraItems,
  ];
  return items;
}

export default function ReviewFilters(props: Props) {
  useReviewFilterToolbarItems(props);
  return null;
}
