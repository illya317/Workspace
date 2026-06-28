"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageSurface, createActionsBlock, createPageDataBlock, useFeedback, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import { matchSearchFields } from "@workspace/platform/search";
import { useStatementConfig } from "./StatementConfigContext";
import LineMappingsPanel from "./LineMappingsPanel";
import type { AcctInfo, ApiErrorBody, ApiLineCfg, ApiTreeNode, InheritedAcct, LineCfg, LineTableRow, Mapping, StatementOperator } from "./types";
import { SECTION_ORDER, SECTIONS } from "./types";
function toLineConfig(line: ApiLineCfg): LineCfg {
  return {
    lineCode: line.lineCode,
    label: line.label,
    section: line.section,
    reclassSource: !!line.reclassSource,
    reclassTarget: !!line.reclassTarget,
    isHeader: !!line.isHeader,
    isTotal: !!line.isTotal,
    isGrandTotal: !!line.isGrandTotal
  };
}
export default function LineConfigTab() {
  const {
    company,
    year
  } = useStatementConfig();
  const feedback = useFeedback();
  const [lines, setLines] = useState<LineCfg[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [accounts, setAccounts] = useState<AcctInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState("");
  const [inheritedByLine, setInheritedByLine] = useState<Map<string, InheritedAcct[]>>(new Map());
  const [accountSearch, setAccountSearch] = useState("");
  const [effectiveCodes, setEffectiveCodes] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const yearNum = parseInt(year, 10);
    if (Number.isNaN(yearNum)) {
      setError("年度无效");
      setLoading(false);
      return;
    }
    const [configResponse, mappingResponse] = await Promise.all([fetch(workspacePath(`/api/modules/finance/statement-config?companyCode=${company}&year=${yearNum}`)), fetch(workspacePath(`/api/modules/finance/statement-config/mappings?companyCode=${company}&year=${yearNum}&statementType=balance`))]);
    if (!configResponse.ok || !mappingResponse.ok) {
      setError(`加载失败 (${configResponse.status}/${mappingResponse.status})`);
      setLoading(false);
      return;
    }
    const configJson = await configResponse.json();
    const mappingJson = await mappingResponse.json();
    setLines((configJson.lineConfigs || []).map(toLineConfig));
    setMappings(mappingJson.mappings || []);
    const nextAccounts: AcctInfo[] = [];
    const nextEffectiveCodes = new Set<string>();
    const walkAccounts = (nodes: ApiTreeNode[]) => {
      for (const node of nodes) {
        nextAccounts.push({
          code: node.accountCode,
          name: node.accountName,
          closingDebit: node.closingDebit,
          closingCredit: node.closingCredit
        });
        if (node.effectiveOperator === "add") nextEffectiveCodes.add(node.accountCode);
        walkAccounts(node.children);
      }
    };
    if (configJson.mappingPreview) walkAccounts(configJson.mappingPreview);
    setAccounts(nextAccounts);
    setEffectiveCodes(nextEffectiveCodes);
    const nextInherited = new Map<string, InheritedAcct[]>();
    const walkInherited = (nodes: ApiTreeNode[]) => {
      for (const node of nodes) {
        if (node.mappingSource === "inherited" && node.resolvedLineCode) {
          const list = nextInherited.get(node.resolvedLineCode) || [];
          list.push({
            accountCode: node.accountCode,
            accountName: node.accountName,
            closingDebit: node.closingDebit,
            closingCredit: node.closingCredit
          });
          nextInherited.set(node.resolvedLineCode, list);
        }
        walkInherited(node.children);
      }
    };
    if (configJson.mappingPreview) walkInherited(configJson.mappingPreview);
    setInheritedByLine(nextInherited);
    setLoading(false);
  }, [company, year]);
  useEffect(() => {
    load();
  }, [load]);
  async function saveMapping(accountCode: string, lineCode: string, operator: StatementOperator) {
    if (!accountCode) return;
    const yearNum = parseInt(year, 10);
    if (Number.isNaN(yearNum)) {
      setError("年度无效");
      return;
    }
    const key = `${lineCode}:${accountCode}`;
    setSaving(previous => new Set(previous).add(key));
    const response = await fetch(workspacePath("/api/modules/finance/statement-config/mappings"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyCode: company,
        year: yearNum,
        statementType: "balance",
        accountCode,
        lineCode,
        operator
      })
    });
    setSaving(previous => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
    if (!response.ok) {
      const body: ApiErrorBody = await response.json().catch((): ApiErrorBody => ({}));
      setError(body.error || `保存失败 (${response.status})`);
      return;
    }
    setAddingFor(null);
    setNewAccount("");
    setAccountSearch("");
    load();
  }
  async function restoreDefault(accountCode: string) {
    const yearNum = parseInt(year, 10);
    if (Number.isNaN(yearNum)) {
      setError("年度无效");
      return;
    }
    const confirmed = await feedback.confirmDelete({
      title: "删除配置",
      message: `确定删除科目 ${accountCode} 的手工配置并恢复默认规则吗？`,
      confirmLabel: "删除配置"
    });
    if (!confirmed) return;
    setSaving(previous => new Set(previous).add(accountCode));
    const response = await fetch(workspacePath(`/api/modules/finance/statement-config/mappings?companyCode=${company}&year=${yearNum}&statementType=balance&accountCode=${encodeURIComponent(accountCode)}`), {
      method: "DELETE"
    });
    setSaving(previous => {
      const next = new Set(previous);
      next.delete(accountCode);
      return next;
    });
    if (!response.ok) {
      const body: ApiErrorBody = await response.json().catch((): ApiErrorBody => ({}));
      setError(body.error || `删除失败 (${response.status})`);
      return;
    }
    load();
  }
  const mappingsByLine = useMemo(() => {
    const grouped = new Map<string, Mapping[]>();
    for (const mapping of mappings) {
      const list = grouped.get(mapping.lineCode) || [];
      list.push(mapping);
      grouped.set(mapping.lineCode, list);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return grouped;
  }, [mappings]);
  const unmappedAccounts = useMemo(() => accounts.filter(account => !effectiveCodes.has(account.code)), [accounts, effectiveCodes]);
  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return unmappedAccounts;
    return unmappedAccounts.filter(account => matchSearchFields(account, accountSearch, ["code", "name"]));
  }, [accountSearch, unmappedAccounts]);
  const accountMap = useMemo(() => new Map(accounts.map(account => [account.code, account])), [accounts]);
  const rows = useMemo<LineTableRow[]>(() => {
    const result: LineTableRow[] = [];
    for (const section of SECTION_ORDER) {
      const sectionLines = lines.filter(line => line.section === section);
      if (sectionLines.length === 0) continue;
      result.push({
        id: `section:${section}`,
        kind: "section",
        section
      });
      for (const line of sectionLines) {
        if (line.isHeader || line.isTotal || line.isGrandTotal) {
          result.push({
            id: line.lineCode,
            kind: "special",
            line
          });
          continue;
        }
        const lineMappings = mappingsByLine.get(line.lineCode) || [];
        const inheritedAccounts = inheritedByLine.get(line.lineCode) || [];
        result.push({
          id: line.lineCode,
          kind: "line",
          line,
          mappings: lineMappings,
          inheritedAccounts,
          accountCount: lineMappings.filter(mapping => mapping.operator !== "exclude").length + inheritedAccounts.length,
          expanded: expanded.has(line.lineCode)
        });
      }
    }
    return result;
  }, [expanded, inheritedByLine, lines, mappingsByLine]);
  const columns = useMemo<DataSurfaceColumnSpec<LineTableRow>[]>(() => [{
    key: "expand",
    label: "",
    required: true,
    headerClassName: "w-8",
    cell: row => row.kind === "line" && row.accountCount > 0 ? row.expanded ? "▼" : "▶" : ""
  }, {
    key: "line",
    label: "报表项目",
    required: true,
    cell: row => {
      if (row.kind === "section") return <span className="font-medium text-slate-500">{SECTIONS[row.section] || row.section}</span>;
      return <span className={row.kind === "special" ? "font-medium text-slate-600" : "font-medium text-slate-700"}>{row.line.label}</span>;
    }
  }, {
    key: "section",
    label: "Section",
    required: true,
    headerClassName: "w-24",
    cellClassName: "text-slate-400",
    cell: row => row.kind === "section" ? "" : SECTIONS[row.line.section] || row.line.section
  }, {
    key: "accounts",
    label: "科目",
    required: true,
    headerClassName: "w-20 text-center",
    cellClassName: "text-center text-slate-600",
    cell: row => row.kind === "line" ? row.accountCount || "—" : row.kind === "special" ? "—" : ""
  }], []);
  if (loading) return <p className="py-8 text-center text-sm text-gray-400">加载中...</p>;
  if (error) {
    return <LineConfigError message={error} onRetry={load} />;
  }
  return <div className="space-y-4">
      <LineConfigTable
        accountMap={accountMap}
        accountSearch={accountSearch}
        addingFor={addingFor}
        columns={columns}
        expanded={expanded}
        filteredAccounts={filteredAccounts}
        newAccount={newAccount}
        onAccountSearchChange={setAccountSearch}
        onCancelAdding={() => {
          setAddingFor(null);
          setNewAccount("");
          setAccountSearch("");
        }}
        onExpandedChange={setExpanded}
        onNewAccountChange={setNewAccount}
        onRestoreDefault={restoreDefault}
        onSaveMapping={saveMapping}
        onStartAdding={setAddingFor}
        rows={rows}
        saving={saving}
      />
    </div>;
}

function LineConfigError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-red-600">{message}</p>
      <PageSurface
        kind="list"
        embedded
        blocks={[createActionsBlock("retry", [{ key: "retry", label: "重试", variant: "danger", onClick: onRetry }], { className: "justify-center" })]}
      />
    </div>
  );
}

function LineConfigTable({
  accountMap,
  accountSearch,
  addingFor,
  columns,
  expanded,
  filteredAccounts,
  newAccount,
  onAccountSearchChange,
  onCancelAdding,
  onExpandedChange,
  onNewAccountChange,
  onRestoreDefault,
  onSaveMapping,
  onStartAdding,
  rows,
  saving,
}: {
  accountMap: Map<string, AcctInfo>;
  accountSearch: string;
  addingFor: string | null;
  columns: DataSurfaceColumnSpec<LineTableRow>[];
  expanded: Set<string>;
  filteredAccounts: AcctInfo[];
  newAccount: string;
  onAccountSearchChange: (value: string) => void;
  onCancelAdding: () => void;
  onExpandedChange: (updater: (previous: Set<string>) => Set<string>) => void;
  onNewAccountChange: (value: string) => void;
  onRestoreDefault: (accountCode: string) => void;
  onSaveMapping: (accountCode: string, lineCode: string, operator: StatementOperator) => void;
  onStartAdding: (lineCode: string) => void;
  rows: LineTableRow[];
  saving: Set<string>;
}) {
  return (
    <PageSurface
      kind="list"
      embedded
      blocks={[
        createPageDataBlock("line-config", {
          kind: "table",
          framed: true,
          className: "overflow-hidden",
          bodyClassName: "overflow-x-auto",
          rows,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: row => row.id,
          density: "compact",
          tableClassName: "text-base",
          onRowClick: row => {
            if (row.kind !== "line") return;
            onExpandedChange(previous => {
              const next = new Set(previous);
              if (next.has(row.line.lineCode)) next.delete(row.line.lineCode);else next.add(row.line.lineCode);
              return next;
            });
          },
          expandedRowKeys: expanded,
          rowClassName: row => row.kind === "section" ? "bg-slate-50" : row.kind === "special" ? "bg-slate-50/50" : "",
          expandedRowBlocks: row => {
            if (row.kind !== "line") return [];
            return [{
              kind: "block",
              key: `line-mappings-${row.line.lineCode}`,
              surface: {
                kind: "content",
                content: (
                  <LineMappingsPanel
                    line={row.line}
                    mappings={row.mappings}
                    inheritedAccounts={row.inheritedAccounts}
                    accountMap={accountMap}
                    saving={saving}
                    addingFor={addingFor}
                    newAccount={newAccount}
                    accountSearch={accountSearch}
                    filteredAccounts={filteredAccounts}
                    onExcludeDefault={(accountCode, lineCode) => onSaveMapping(accountCode, lineCode, "exclude")}
                    onRestoreDefault={onRestoreDefault}
                    onToggleOperator={(accountCode, lineCode, current) => onSaveMapping(accountCode, lineCode, current === "add" ? "subtract" : "add")}
                    onSaveMapping={onSaveMapping}
                    onStartAdding={onStartAdding}
                    onCancelAdding={onCancelAdding}
                    onNewAccountChange={onNewAccountChange}
                    onAccountSearchChange={onAccountSearchChange}
                  />
                ),
              },
            }];
          },
        }),
      ]}
    />
  );
}
