"use client";

import { useMemo } from "react";
import { createPageBody, PageSurface, createActionsBlock, createPageDataBlock, createInlineFieldsBlock, type DataSurfaceColumnSpec } from "@workspace/core/ui";
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
  const mappingColumns = useMemo<DataSurfaceColumnSpec<Mapping>[]>(() => [{
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
    font: "mono",
    cell: mapping => mapping.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,

    cell: mapping => accountMap.get(mapping.accountCode)?.name || mapping.accountCode
  }, {
    key: "debit",
    label: "借方",
    required: true,
    align: "right",

    cell: mapping => {
      const account = accountMap.get(mapping.accountCode);
      return account ? formatStatementAmount(account.closingDebit) : "—";
    }
  }, {
    key: "credit",
    label: "贷方",
    required: true,
    align: "right",

    cell: mapping => {
      const account = accountMap.get(mapping.accountCode);
      return account ? formatStatementAmount(account.closingCredit) : "—";
    }
  }, {
    key: "status",
    label: "状态",
    required: true,
    align: "center",
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
  const inheritedColumns = useMemo<DataSurfaceColumnSpec<InheritedAcct>[]>(() => [{
    key: "source",
    label: "来源",
    required: true,
    cell: () => ({ kind: "badge", label: "继承", tone: "gray" })
  }, {
    key: "accountCode",
    label: "科目编码",
    required: true,
    font: "mono", tone: "muted",
    cell: account => account.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    tone: "muted",
    cell: account => account.accountName
  }, {
    key: "debit",
    label: "借方",
    required: true,
    align: "right",
     tone: "muted",
    cell: account => formatStatementAmount(account.closingDebit)
  }, {
    key: "credit",
    label: "贷方",
    required: true,
    align: "right",
     tone: "muted",
    cell: account => formatStatementAmount(account.closingCredit)
  }, {
    key: "action",
    label: "操作",
    required: true,
    align: "center",
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
      {mappings.length > 0 && <MappingTable mappings={mappings} columns={mappingColumns} />}
      {inheritedAccounts.length > 0 && <div className="space-y-1">
          <p className="text-base text-gray-400">继承科目（来自 prefix/父级）</p>
          <InheritedTable accounts={inheritedAccounts} columns={inheritedColumns} />
        </div>}
      {isAdding ? <div className="flex flex-col gap-2">
          <MappingEditor
            accountSearch={accountSearch}
            filteredAccounts={filteredAccounts}
            lineCode={line.lineCode}
            newAccount={newAccount}
            onAccountSearchChange={onAccountSearchChange}
            onCancelAdding={onCancelAdding}
            onNewAccountChange={onNewAccountChange}
            onSaveMapping={onSaveMapping}
          />
        </div> : <AddMappingButton lineCode={line.lineCode} onStartAdding={onStartAdding} />}
    </div>;
}

function MappingTable({ mappings, columns }: { mappings: Mapping[]; columns: DataSurfaceColumnSpec<Mapping>[] }) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createPageDataBlock("line-mappings", {
          kind: "table",
          rows: mappings,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: mapping => mapping.accountCode,
                    presentation: { density: "compact" },


          rowState: mapping => mapping.operator === "exclude" ? "muted" : "normal",
        }),
      ])}
    />
  );
}

function InheritedTable({ accounts, columns }: { accounts: InheritedAcct[]; columns: DataSurfaceColumnSpec<InheritedAcct>[] }) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createPageDataBlock("inherited-accounts", {
          kind: "table",
          rows: accounts,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: account => account.accountCode,
                    presentation: { density: "compact" },


        }),
      ])}
    />
  );
}

function MappingEditor({
  accountSearch,
  filteredAccounts,
  lineCode,
  newAccount,
  onAccountSearchChange,
  onCancelAdding,
  onNewAccountChange,
  onSaveMapping,
}: {
  accountSearch: string;
  filteredAccounts: AcctInfo[];
  lineCode: string;
  newAccount: string;
  onAccountSearchChange: (value: string) => void;
  onCancelAdding: () => void;
  onNewAccountChange: (value: string) => void;
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator) => void;
}) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createInlineFieldsBlock("mapping-editor", [
          { key: "search", label: "搜索", spec: { valueType: "string", control: "text" }, placeholder: "搜索科目编码或名称...", value: accountSearch, onChange: (value) => onAccountSearchChange(String(value ?? "")),  },
          { key: "account", label: "科目", spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: filteredAccounts.map(account => ({ value: account.code, label: `${account.code} ${account.name}` })) } }, value: newAccount, onChange: (value) => onNewAccountChange(String(value ?? "")), placeholder: `选择科目 (${filteredAccounts.length})` },
        ], {
          kind: "filters",
          actions: [
            { key: "add", label: "添加（加）", variant: "primary", onClick: () => onSaveMapping(newAccount, lineCode, "add"), disabled: !newAccount },
            { key: "subtract", label: "添加（减）", variant: "danger", onClick: () => onSaveMapping(newAccount, lineCode, "subtract"), disabled: !newAccount },
            { key: "cancel", label: "取消", onClick: onCancelAdding },
          ],
        }),
      ])}
    />
  );
}

function AddMappingButton({ lineCode, onStartAdding }: { lineCode: string; onStartAdding: (lineCode: string) => void }) {
  return (
    <PageSurface
      kind="list"
      embedded
      body={createPageBody([
        createActionsBlock("add-mapping", [{ key: "add-account", label: "添加科目", onClick: () => onStartAdding(lineCode) }]),
      ])}
    />
  );
}
