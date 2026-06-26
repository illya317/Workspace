"use client";

import { Badge, CommandButton, FormField, InputControl, PanelCard } from "@workspace/core/ui";
interface DeptBudgetFiltersProps {
  deptFilter: string;
  setDeptFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  accountFilter: string;
  setAccountFilter: (v: string) => void;
  deptOptions: string[];
  typeOptions: string[];
  accountOptions: string[];
  count: number;
  total: number;
}
export default function DeptBudgetFilters({
  deptFilter,
  setDeptFilter,
  typeFilter,
  setTypeFilter,
  accountFilter,
  setAccountFilter,
  deptOptions,
  typeOptions,
  accountOptions,
  count,
  total
}: DeptBudgetFiltersProps) {
  return <>
      <PanelCard bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <FormField label="部门" layout="inline">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: deptOptions.map(d => ({ value: d, label: d })) } }} value={deptFilter} onChange={(value) => setDeptFilter(String(value ?? ""))} placeholder="全部部门" />
        </FormField>
        <FormField label="费用类型" layout="inline">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: typeOptions.map(t => ({ value: t, label: t })) } }} value={typeFilter} onChange={(value) => setTypeFilter(String(value ?? ""))} placeholder="全部类型" />
        </FormField>
        <FormField label="科目" layout="inline">
          <InputControl spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: accountOptions.map(a => ({ value: a, label: a })) } }} value={accountFilter} onChange={(value) => setAccountFilter(String(value ?? ""))} placeholder="全部科目" />
        </FormField>
        {(deptFilter || typeFilter || accountFilter) && <CommandButton onClick={() => {
        setDeptFilter("");
        setTypeFilter("");
        setAccountFilter("");
      }} className="border-0 px-2 py-1 text-xs shadow-none">
            重置筛选
          </CommandButton>}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </PanelCard>
      {(deptFilter || typeFilter || accountFilter) && <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {deptFilter && <Badge label={`部门：${deptFilter}`} tone="gray" />}
          {typeFilter && <Badge label={`类型：${typeFilter}`} tone="gray" />}
          {accountFilter && <Badge label={`科目：${accountFilter}`} tone="gray" />}
        </div>}
    </>;
}
