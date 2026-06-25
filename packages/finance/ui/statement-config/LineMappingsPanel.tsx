"use client";

import { useMemo } from "react";
import { DataTable, SearchInput, SelectField, Badge, type DataTableColumn, getToolbarActionClassName } from "@workspace/core/ui";
import type { AcctInfo, InheritedAcct, LineCfg, Mapping, StatementOperator } from "./types";
import { formatStatementAmount, isDefaultMapping } from "./types";
interface LineMappingsPanelProps {
  line: LineCfg;
  mappings: Mapping[];
  inheritedAccounts: InheritedAcct[];
  accountMap: Map<string, AcctInfo>;
  saving: Set<string>;
  addingFor: string | null;
  newAccount: string;
  accountSearch: string;
  filteredAccounts: AcctInfo[];
  onExcludeDefault: (accountCode: string, lineCode: string) => void;
  onRestoreDefault: (accountCode: string) => void;
  onToggleOperator: (accountCode: string, lineCode: string, current: StatementOperator) => void;
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator) => void;
  onStartAdding: (lineCode: string) => void;
  onCancelAdding: () => void;
  onNewAccountChange: (value: string) => void;
  onAccountSearchChange: (value: string) => void;
}
function MappingAction({
  mapping,
  saving,
  onExcludeDefault,
  onRestoreDefault,
  onToggleOperator
}: {
  mapping: Mapping;
  saving: boolean;
  onExcludeDefault: () => void;
  onRestoreDefault: () => void;
  onToggleOperator: () => void;
}) {
  if (mapping.operator === "exclude") {
    return <button type="button" onClick={onRestoreDefault} disabled={saving} className={getToolbarActionClassName()}>恢复默认</button>;
  }
  if (isDefaultMapping(mapping)) {
    return <button type="button" onClick={onExcludeDefault} disabled={saving} className={getToolbarActionClassName()}>排除默认</button>;
  }
  return <button type="button" onClick={onToggleOperator} disabled={saving} className={getToolbarActionClassName(mapping.operator === "subtract" ? "danger" : "secondary")}>
      {mapping.operator === "subtract" ? "减" : "加"}
    </button>;
}
function MappingStatus({
  mapping
}: {
  mapping: Mapping;
}) {
  if (mapping.operator === "exclude") {
    return <Badge label="已排除" tone="gray" />;
  }
  if (isDefaultMapping(mapping)) {
    return <Badge label="系统建议" tone="yellow" />;
  }
  return null;
}
export default function LineMappingsPanel({
  line,
  mappings,
  inheritedAccounts,
  accountMap,
  saving,
  addingFor,
  newAccount,
  accountSearch,
  filteredAccounts,
  onExcludeDefault,
  onRestoreDefault,
  onToggleOperator,
  onSaveMapping,
  onStartAdding,
  onCancelAdding,
  onNewAccountChange,
  onAccountSearchChange
}: LineMappingsPanelProps) {
  const mappingColumns = useMemo<DataTableColumn<Mapping>[]>(() => [{
    key: "action",
    label: "操作",
    required: true,
    render: mapping => {
      const isSaving = saving.has(`${line.lineCode}:${mapping.accountCode}`) || saving.has(mapping.accountCode);
      return <MappingAction mapping={mapping} saving={isSaving} onExcludeDefault={() => onExcludeDefault(mapping.accountCode, line.lineCode)} onRestoreDefault={() => onRestoreDefault(mapping.accountCode)} onToggleOperator={() => onToggleOperator(mapping.accountCode, line.lineCode, mapping.operator)} />;
    }
  }, {
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-gray-600",
    render: mapping => mapping.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    cellClassName: "text-gray-700",
    render: mapping => accountMap.get(mapping.accountCode)?.name || mapping.accountCode
  }, {
    key: "debit",
    label: "借方",
    required: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-gray-600",
    render: mapping => {
      const account = accountMap.get(mapping.accountCode);
      return account ? formatStatementAmount(account.closingDebit) : "—";
    }
  }, {
    key: "credit",
    label: "贷方",
    required: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-gray-600",
    render: mapping => {
      const account = accountMap.get(mapping.accountCode);
      return account ? formatStatementAmount(account.closingCredit) : "—";
    }
  }, {
    key: "status",
    label: "状态",
    required: true,
    cellClassName: "text-center",
    render: mapping => {
      const isSaving = saving.has(mapping.accountCode);
      return isDefaultMapping(mapping) || mapping.operator === "exclude" ? <MappingStatus mapping={mapping} /> : <button type="button" onClick={() => onRestoreDefault(mapping.accountCode)} disabled={isSaving} className={getToolbarActionClassName("danger")}>
            删除配置
          </button>;
    }
  }], [accountMap, line.lineCode, onExcludeDefault, onRestoreDefault, onToggleOperator, saving]);
  const inheritedColumns = useMemo<DataTableColumn<InheritedAcct>[]>(() => [{
    key: "source",
    label: "来源",
    required: true,
    render: () => <Badge label="继承" tone="gray" />
  }, {
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-gray-500",
    render: account => account.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    cellClassName: "text-gray-500",
    render: account => account.accountName
  }, {
    key: "debit",
    label: "借方",
    required: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-gray-400",
    render: account => formatStatementAmount(account.closingDebit)
  }, {
    key: "credit",
    label: "贷方",
    required: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-gray-400",
    render: account => formatStatementAmount(account.closingCredit)
  }, {
    key: "action",
    label: "操作",
    required: true,
    cellClassName: "text-center",
    render: account => <button type="button" onClick={() => onSaveMapping(account.accountCode, line.lineCode, "exclude")} disabled={saving.has(`${line.lineCode}:${account.accountCode}`)} className={getToolbarActionClassName()}>
          排除
        </button>
  }], [line.lineCode, onSaveMapping, saving]);
  const isAdding = addingFor === line.lineCode;
  return <div className="space-y-3">
      {mappings.length > 0 && <DataTable rows={mappings} columns={mappingColumns} visibleColumns={mappingColumns.map(column => column.key)} rowKey={mapping => mapping.accountCode} density="compact" tableClassName="text-base" rowClassName={mapping => mapping.operator === "exclude" ? "bg-slate-100/50" : ""} />}
      {inheritedAccounts.length > 0 && <div className="space-y-1">
          <p className="text-base text-gray-400">继承科目（来自 prefix/父级）</p>
          <DataTable rows={inheritedAccounts} columns={inheritedColumns} visibleColumns={inheritedColumns.map(column => column.key)} rowKey={account => account.accountCode} density="compact" tableClassName="text-base" />
        </div>}
      {isAdding ? <div className="flex flex-col gap-2">
          <SearchInput placeholder="搜索科目编码或名称..." value={accountSearch} onChange={onAccountSearchChange} className="w-64" />
          <div className="flex items-center gap-2">
            <SelectField value={newAccount} onChange={onNewAccountChange} placeholder={`选择科目 (${filteredAccounts.length})`} options={filteredAccounts.map(account => ({
          value: account.code,
          label: `${account.code} ${account.name}`
        }))} triggerClassName="w-64 px-2 py-1 text-sm" />
            <button type="button" onClick={() => onSaveMapping(newAccount, line.lineCode, "add")} disabled={!newAccount} className={getToolbarActionClassName("primary")}>
              添加（加）
            </button>
            <button type="button" onClick={() => onSaveMapping(newAccount, line.lineCode, "subtract")} disabled={!newAccount} className={getToolbarActionClassName("danger")}>
              添加（减）
            </button>
            <button type="button" onClick={onCancelAdding} className={getToolbarActionClassName()}>取消</button>
          </div>
        </div> : <button type="button" onClick={() => onStartAdding(line.lineCode)} className={getToolbarActionClassName()}>添加科目</button>}
    </div>;
}
