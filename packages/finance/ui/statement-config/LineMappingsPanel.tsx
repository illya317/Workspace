"use client";

import { useMemo } from "react";
import { createPageBody, PageSurface, createActionsSection, createPageDataSection, createInlineFieldsSection, type DataSurfaceColumnSpec, type DataSurfaceRowActionSpec } from "@workspace/core/ui";
import type { AcctInfo, InheritedAcct, LineCfg, Mapping, StatementOperator } from "./types";
import { formatStatementAmount, isDefaultMapping } from "./types";
interface LineMappingsPanelProps {
  line: LineCfg;
  mappings: Mapping[];
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
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
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator, mode?: "create" | "write") => void;
  onStartAdding: (lineCode: string) => void;
  onCancelAdding: () => void;
  onNewAccountChange: (value: string) => void;
  onAccountSearchChange: (value: string) => void;
}
export default function LineMappingsPanel({
  line,
  mappings,
  canCreate,
  canWrite,
  canDelete,
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
      if (isSaving) return { kind: "badge", label: "保存中", tone: "blue" };
      return { kind: "badge", label: "手工配置", tone: "green" };
    }
  }], [accountMap, saving]);
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
  }], []);
  const isAdding = addingFor === line.lineCode;
  return <div className="space-y-3">
      {mappings.length > 0 && <MappingTable
        lineCode={line.lineCode}
        mappings={mappings}
        columns={mappingColumns}
        saving={saving}
        canCreate={canCreate}
        canWrite={canWrite}
        canDelete={canDelete}
        onExcludeDefault={onExcludeDefault}
        onRestoreDefault={onRestoreDefault}
        onToggleOperator={onToggleOperator}
      />}
      {inheritedAccounts.length > 0 && <div className="space-y-1">
          <p className="text-base text-gray-400">继承科目（来自 prefix/父级）</p>
          <InheritedTable accounts={inheritedAccounts} columns={inheritedColumns} lineCode={line.lineCode} saving={saving} canCreate={canCreate} onSaveMapping={onSaveMapping} />
        </div>}
      {canCreate && isAdding ? <div className="flex flex-col gap-2">
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
        </div> : canCreate ? <AddMappingButton lineCode={line.lineCode} onStartAdding={onStartAdding} /> : null}
    </div>;
}

function MappingTable({
  lineCode,
  mappings,
  columns,
  saving,
  canCreate,
  canWrite,
  canDelete,
  onExcludeDefault,
  onRestoreDefault,
  onToggleOperator,
}: {
  lineCode: string;
  mappings: Mapping[];
  columns: DataSurfaceColumnSpec<Mapping>[];
  saving: Set<string>;
  canCreate: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onExcludeDefault: (accountCode: string, lineCode: string) => void;
  onRestoreDefault: (accountCode: string) => void;
  onToggleOperator: (accountCode: string, lineCode: string, current: StatementOperator) => void;
}) {
  const rowActions = (mapping: Mapping): DataSurfaceRowActionSpec[] => {
    const isSaving = saving.has(`${lineCode}:${mapping.accountCode}`) || saving.has(mapping.accountCode);
    const actions: DataSurfaceRowActionSpec[] = [];
    if (mapping.operator === "exclude" || isDefaultMapping(mapping)) {
      if (mapping.operator === "exclude" && canDelete) {
        actions.push({
          key: `restore-default-${mapping.accountCode}`,
          kind: "delete",
          label: "删除配置",
          disabled: isSaving,
          onClick: () => onRestoreDefault(mapping.accountCode),
        });
      }
      if (mapping.operator !== "exclude" && canCreate) {
        actions.push({
          key: `exclude-default-${mapping.accountCode}`,
          kind: "add",
          label: "排除默认",
          disabled: isSaving,
          onClick: () => onExcludeDefault(mapping.accountCode, lineCode),
        });
      }
      return actions;
    }
    if (canWrite) {
      actions.push({
        key: `toggle-${mapping.accountCode}`,
        kind: "edit",
        label: mapping.operator === "subtract" ? "切换为加项" : "切换为减项",
        disabled: isSaving,
        onClick: () => onToggleOperator(mapping.accountCode, lineCode, mapping.operator),
      });
    }
    if (canDelete) {
      actions.push({
        key: `delete-${mapping.accountCode}`,
        kind: "delete",
        label: "删除配置",
        disabled: isSaving,
        onClick: () => onRestoreDefault(mapping.accountCode),
      });
    }
    return actions;
  };
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageDataSection("line-mappings", {
          kind: "table",
          rows: mappings,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: mapping => mapping.accountCode,
                    presentation: { density: "compact" },
          rowActions,
          actionsColumn: { label: "操作", align: "center" },


          rowState: mapping => mapping.operator === "exclude" ? "muted" : "normal",
        }),
      ])}
    />
  );
}

function InheritedTable({
  accounts,
  columns,
  lineCode,
  saving,
  canCreate,
  onSaveMapping,
}: {
  accounts: InheritedAcct[];
  columns: DataSurfaceColumnSpec<InheritedAcct>[];
  lineCode: string;
  saving: Set<string>;
  canCreate: boolean;
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator, mode?: "create" | "write") => void;
}) {
  const rowActions = canCreate ? (account: InheritedAcct): DataSurfaceRowActionSpec[] => [{
    key: `exclude-inherited-${account.accountCode}`,
    kind: "add",
    label: "排除",
    disabled: saving.has(`${lineCode}:${account.accountCode}`),
    onClick: () => onSaveMapping(account.accountCode, lineCode, "exclude"),
  }] : undefined;
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createPageDataSection("inherited-accounts", {
          kind: "table",
          rows: accounts,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: account => account.accountCode,
                    presentation: { density: "compact" },
          rowActions,
          actionsColumn: { label: "操作", align: "center" },


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
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator, mode?: "create" | "write") => void;
}) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createInlineFieldsSection("mapping-editor", [
          { key: "search", label: "搜索", spec: { valueType: "string", control: "text" }, placeholder: "搜索科目编码或名称...", value: accountSearch, onChange: (value) => onAccountSearchChange(String(value ?? "")),  },
          { key: "account", label: "科目", spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: filteredAccounts.map(account => ({ value: account.code, label: `${account.code} ${account.name}` })) } }, value: newAccount, onChange: (value) => onNewAccountChange(String(value ?? "")), placeholder: `选择科目 (${filteredAccounts.length})` },
        ], {
          kind: "filters",
          commands: [
            { key: "add", label: "添加（加）", icon: "add", variant: "primary", onClick: () => onSaveMapping(newAccount, lineCode, "add"), disabled: !newAccount },
            { key: "subtract", label: "添加（减）", icon: "add", variant: "danger", onClick: () => onSaveMapping(newAccount, lineCode, "subtract"), disabled: !newAccount },
            { key: "cancel", label: "取消", icon: "cancel", onClick: onCancelAdding },
          ],
        }),
      ])}
    />
  );
}

function AddMappingButton({ lineCode, onStartAdding }: { lineCode: string; onStartAdding: (lineCode: string) => void }) {
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createActionsSection("add-mapping", [{ key: "add-account", label: "添加科目", icon: "add", onClick: () => onStartAdding(lineCode) }]),
      ])}
    />
  );
}
