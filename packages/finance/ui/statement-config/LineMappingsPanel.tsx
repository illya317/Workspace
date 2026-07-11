"use client";

import type { DataSurfaceCellSpec, DataSurfaceColumnSpec, DataSurfaceRowActionSpec } from "@workspace/core/ui";
import type { AcctInfo, InheritedAcct, LineCfg, Mapping, StatementOperator } from "./types";
import { formatStatementAmount, isDefaultMapping } from "./types";

export interface LineMappingsPanelProps {
  line: LineCfg;
  mappings: Mapping[];
  canCreate: boolean;
  canUpdate: boolean;
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
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator, mode?: "create" | "update") => void;
  onStartAdding: (lineCode: string) => void;
  onCancelAdding: () => void;
  onNewAccountChange: (value: string) => void;
  onAccountSearchChange: (value: string) => void;
}

/** @ui-structural-declaration Expanded mapping workspace with tables, editor, and actions. */
export function createLineMappingsPanelSpec(props: LineMappingsPanelProps): DataSurfaceCellSpec {
  const { line, mappings, inheritedAccounts, accountMap, saving } = props;
  const mappingColumns: DataSurfaceColumnSpec<Mapping>[] = [
    { key: "accountCode", label: "科目编码", required: true, font: "mono", cell: row => row.accountCode },
    { key: "accountName", label: "科目名称", required: true, cell: row => accountMap.get(row.accountCode)?.name || row.accountCode },
    { key: "debit", label: "借方", required: true, align: "right", cell: row => formatStatementAmount(accountMap.get(row.accountCode)?.closingDebit ?? 0) },
    { key: "credit", label: "贷方", required: true, align: "right", cell: row => formatStatementAmount(accountMap.get(row.accountCode)?.closingCredit ?? 0) },
    { key: "status", label: "状态", required: true, align: "center", cell: row => mappingStatus(row, saving.has(row.accountCode)) },
  ];
  const inheritedColumns: DataSurfaceColumnSpec<InheritedAcct>[] = [
    { key: "source", label: "来源", required: true, cell: () => ({ kind: "badge", label: "继承", tone: "gray" }) },
    { key: "accountCode", label: "科目编码", required: true, font: "mono", tone: "muted", cell: row => row.accountCode },
    { key: "accountName", label: "科目名称", required: true, tone: "muted", cell: row => row.accountName },
    { key: "debit", label: "借方", required: true, align: "right", tone: "muted", cell: row => formatStatementAmount(row.closingDebit) },
    { key: "credit", label: "贷方", required: true, align: "right", tone: "muted", cell: row => formatStatementAmount(row.closingCredit) },
  ];

  const items: DataSurfaceCellSpec[] = [];
  if (mappings.length) items.push({
    kind: "data",
    data: {
      kind: "table",
      rows: mappings,
      columns: mappingColumns,
      visibleColumns: mappingColumns.map(column => column.key),
      rowKey: row => row.accountCode,
      presentation: { density: "compact" },
      rowState: row => row.operator === "exclude" ? "muted" : "normal",
      rowActions: row => mappingActions(row, props),
      actionsColumn: { label: "操作", align: "center" },
    },
  });
  if (inheritedAccounts.length) items.push(
    { kind: "text", value: "继承科目（来自 prefix/父级）", tone: "muted", emphasis: "medium" },
    {
      kind: "data",
      data: {
        kind: "table",
        rows: inheritedAccounts,
        columns: inheritedColumns,
        visibleColumns: inheritedColumns.map(column => column.key),
        rowKey: row => row.accountCode,
        presentation: { density: "compact" },
        rowActions: props.canCreate ? row => [{ key: `exclude-inherited-${row.accountCode}`, kind: "delete", label: "排除", disabled: saving.has(`${line.lineCode}:${row.accountCode}`), onClick: () => props.onSaveMapping(row.accountCode, line.lineCode, "exclude") }] : undefined,
        actionsColumn: { label: "操作", align: "center" },
      },
    },
  );
  if (props.canCreate && props.addingFor === line.lineCode) items.push(mappingEditor(props));
  else if (props.canCreate) items.push({ kind: "action", action: { key: "add-account", label: "添加科目", icon: "add", onClick: () => props.onStartAdding(line.lineCode) } });
  return { kind: "group", direction: "column", items };
}

function mappingStatus(mapping: Mapping, saving: boolean): DataSurfaceCellSpec {
  if (mapping.operator === "exclude") return { kind: "badge", label: "已排除", tone: "gray" };
  if (isDefaultMapping(mapping)) return { kind: "badge", label: "系统建议", tone: "yellow" };
  if (saving) return { kind: "badge", label: "保存中", tone: "blue" };
  return { kind: "badge", label: "手工配置", tone: "green" };
}

function mappingActions(mapping: Mapping, props: LineMappingsPanelProps): DataSurfaceRowActionSpec[] {
  const saving = props.saving.has(`${props.line.lineCode}:${mapping.accountCode}`) || props.saving.has(mapping.accountCode);
  if (mapping.operator === "exclude" || isDefaultMapping(mapping)) {
    if (mapping.operator === "exclude" && props.canDelete) return [{ key: `restore-${mapping.accountCode}`, kind: "delete", label: "删除配置", disabled: saving, onClick: () => props.onRestoreDefault(mapping.accountCode) }];
    if (mapping.operator !== "exclude" && props.canCreate) return [{ key: `exclude-${mapping.accountCode}`, kind: "delete", label: "排除默认", disabled: saving, onClick: () => props.onExcludeDefault(mapping.accountCode, props.line.lineCode) }];
    return [];
  }
  return [
    ...(props.canUpdate ? [{ key: `toggle-${mapping.accountCode}`, kind: "edit" as const, label: mapping.operator === "subtract" ? "切换为加项" : "切换为减项", disabled: saving, onClick: () => props.onToggleOperator(mapping.accountCode, props.line.lineCode, mapping.operator) }] : []),
    ...(props.canDelete ? [{ key: `delete-${mapping.accountCode}`, kind: "delete" as const, label: "删除配置", disabled: saving, onClick: () => props.onRestoreDefault(mapping.accountCode) }] : []),
  ];
}

function mappingEditor(props: LineMappingsPanelProps): DataSurfaceCellSpec {
  return { kind: "group", items: [
    { kind: "input", spec: { valueType: "string", control: "text" }, value: props.accountSearch, onChange: value => props.onAccountSearchChange(String(value ?? "")), placeholder: "搜索科目编码或名称...", density: "compact" },
    { kind: "input", spec: { valueType: "string", control: "choice", options: { source: "static", items: props.filteredAccounts.map(account => ({ value: account.code, label: `${account.code} ${account.name}` })) } }, value: props.newAccount, onChange: value => props.onNewAccountChange(String(value ?? "")), placeholder: `选择科目 (${props.filteredAccounts.length})`, density: "compact" },
    { kind: "actions", actions: [
      { key: "add", label: "添加（加）", icon: "add", onClick: () => props.onSaveMapping(props.newAccount, props.line.lineCode, "add"), disabled: !props.newAccount },
      { key: "subtract", label: "添加（减）", icon: "delete-minus", onClick: () => props.onSaveMapping(props.newAccount, props.line.lineCode, "subtract"), disabled: !props.newAccount },
      { key: "cancel", label: "取消", icon: "cancel", onClick: props.onCancelAdding },
    ] },
  ] };
}
