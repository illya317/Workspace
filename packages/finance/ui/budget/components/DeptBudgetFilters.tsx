"use client";

import { ActionButton, FormField, PanelCard, SelectField, StatusBadge } from "@workspace/core/ui";

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
  total,
}: DeptBudgetFiltersProps) {
  return (
    <>
      <PanelCard bodyClassName="flex flex-wrap items-center gap-3 p-3">
        <FormField label="部门" layout="inline">
          <SelectField
            value={deptFilter}
            onChange={setDeptFilter}
            placeholder="全部部门"
            options={deptOptions.map((d) => ({ value: d, label: d }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </FormField>
        <FormField label="费用类型" layout="inline">
          <SelectField
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="全部类型"
            options={typeOptions.map((t) => ({ value: t, label: t }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </FormField>
        <FormField label="科目" layout="inline">
          <SelectField
            value={accountFilter}
            onChange={setAccountFilter}
            placeholder="全部科目"
            options={accountOptions.map((a) => ({ value: a, label: a }))}
            selectClassName="min-w-28 px-2 py-1 text-xs"
          />
        </FormField>
        {(deptFilter || typeFilter || accountFilter) && (
          <ActionButton
            onClick={() => { setDeptFilter(""); setTypeFilter(""); setAccountFilter(""); }}
            className="border-0 px-2 py-1 text-xs shadow-none"
          >
            重置筛选
          </ActionButton>
        )}
        <span className="ml-auto text-xs text-gray-400">
          共 {count} 条，合计 {total.toFixed(2)} 万元
        </span>
      </PanelCard>
      {(deptFilter || typeFilter || accountFilter) && (
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>当前筛选：</span>
          {deptFilter && <StatusBadge label={`部门：${deptFilter}`} variant="gray" />}
          {typeFilter && <StatusBadge label={`类型：${typeFilter}`} variant="gray" />}
          {accountFilter && <StatusBadge label={`科目：${accountFilter}`} variant="gray" />}
        </div>
      )}
    </>
  );
}
