"use client";

import { useMemo } from "react";
import { DataSurface, FormSurface, type DataSurfaceColumnSpec, type DataTableColumn } from "@workspace/core/ui";
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
  const mappingColumns = useMemo<Array<DataTableColumn<Mapping> | DataSurfaceColumnSpec<Mapping>>>(() => [{
    key: "action",
    label: "操作",
    required: true,
    cell: mapping => {
      const isSaving = saving.has(`${line.lineCode}:${mapping.accountCode}`) || saving.has(mapping.accountCode);
      if (mapping.operator === "exclude") {
        return { kind: "action", action: { key: "restore", label: "恢复默认", size: "sm", disabled: isSaving, onClick: () => onRestoreDefault(mapping.accountCode) } };
      }
      if (isDefaultMapping(mapping)) {
        return { kind: "action", action: { key: "exclude", label: "排除默认", size: "sm", disabled: isSaving, onClick: () => onExcludeDefault(mapping.accountCode, line.lineCode) } };
      }
      return {
        kind: "action",
        action: {
          key: "toggle",
          label: mapping.operator === "subtract" ? "减" : "加",
          variant: mapping.operator === "subtract" ? "danger" : "secondary",
          size: "sm",
          disabled: isSaving,
          onClick: () => onToggleOperator(mapping.accountCode, line.lineCode, mapping.operator),
        },
      };
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
    cell: mapping => {
      const isSaving = saving.has(mapping.accountCode);
      if (mapping.operator === "exclude") return { kind: "badge", label: "已排除", tone: "gray" };
      if (isDefaultMapping(mapping)) return { kind: "badge", label: "系统建议", tone: "yellow" };
      return {
        kind: "action",
        action: {
          key: "delete-config",
          label: "删除配置",
          variant: "danger",
          size: "sm",
          disabled: isSaving,
          onClick: () => onRestoreDefault(mapping.accountCode),
        },
      };
    }
  }], [accountMap, line.lineCode, onExcludeDefault, onRestoreDefault, onToggleOperator, saving]);
  const inheritedColumns = useMemo<Array<DataTableColumn<InheritedAcct> | DataSurfaceColumnSpec<InheritedAcct>>>(() => [{
    key: "source",
    label: "来源",
    required: true,
    cell: () => ({ kind: "badge", label: "继承", tone: "gray" })
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
    cell: account => ({
      kind: "action",
      action: {
        key: "exclude-inherited",
        label: "排除",
        size: "sm",
        disabled: saving.has(`${line.lineCode}:${account.accountCode}`),
        onClick: () => onSaveMapping(account.accountCode, line.lineCode, "exclude"),
      },
    })
  }], [line.lineCode, onSaveMapping, saving]);
  const isAdding = addingFor === line.lineCode;
  return <div className="space-y-3">
      {mappings.length > 0 && <DataSurface kind="table" rows={mappings} columns={mappingColumns} visibleColumns={mappingColumns.map(column => column.key)} rowKey={mapping => mapping.accountCode} density="compact" tableClassName="text-base" rowClassName={mapping => mapping.operator === "exclude" ? "bg-slate-100/50" : ""} />}
      {inheritedAccounts.length > 0 && <div className="space-y-1">
          <p className="text-base text-gray-400">继承科目（来自 prefix/父级）</p>
          <DataSurface kind="table" rows={inheritedAccounts} columns={inheritedColumns} visibleColumns={inheritedColumns.map(column => column.key)} rowKey={account => account.accountCode} density="compact" tableClassName="text-base" />
        </div>}
      {isAdding ? <div className="flex flex-col gap-2">
          <FormSurface
            kind="filters"
            fields={[
              { key: "search", label: "搜索", spec: { valueType: "string", editor: "input" }, placeholder: "搜索科目编码或名称...", value: accountSearch, onChange: (value) => onAccountSearchChange(String(value ?? "")), className: "w-64" },
              { key: "account", label: "科目", spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: filteredAccounts.map(account => ({ value: account.code, label: `${account.code} ${account.name}` })) } }, value: newAccount, onChange: (value) => onNewAccountChange(String(value ?? "")), placeholder: `选择科目 (${filteredAccounts.length})` },
            ]}
            actions={[
              { key: "add", label: "添加（加）", variant: "primary", onClick: () => onSaveMapping(newAccount, line.lineCode, "add"), disabled: !newAccount },
              { key: "subtract", label: "添加（减）", variant: "danger", onClick: () => onSaveMapping(newAccount, line.lineCode, "subtract"), disabled: !newAccount },
              { key: "cancel", label: "取消", onClick: onCancelAdding },
            ]}
          />
        </div> : <FormSurface kind="inline" actions={[{ key: "add-account", label: "添加科目", onClick: () => onStartAdding(line.lineCode) }]} />}
    </div>;
}
