"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState } from "react";
import { createPageBody, createMessageSection, PageSurface, createPageDataSection, createRecordSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import { formatFinanceAmount } from "../formatters";
import { useStatementConfig } from "./StatementConfigContext";
interface Node {
  accountCode: string;
  accountName: string;
  level: number;
  closingDebit: number;
  closingCredit: number;
  net: number;
  resolvedLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  effectiveOperator: "add" | "subtract" | "exclude" | null;
  children: Node[];
}
type Status = "unmapped" | "subtractOnly" | "excluded";
interface DisplayItem {
  accountCode: string;
  accountName: string;
  level: number;
  closingDebit: number;
  closingCredit: number;
  net: number;
  status: Status;
  subtractSourceLine: string | null;
}
function createUnmappedColumns(): DataSurfaceColumnSpec<DisplayItem>[] {
  return [{
    key: "accountCode",
    label: "科目编码",
    required: true,
    font: "mono",
    cell: row => row.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    cell: row => row.accountName
  }, {
    key: "level",
    label: "层级",
    defaultVisible: true,
    align: "center",
     tone: "muted",
    cell: row => `L${row.level}`
  }, {
    key: "closingDebit",
    label: "期末借方",
    defaultVisible: true,
    align: "right",

    cell: row => formatFinanceAmount(row.closingDebit)
  }, {
    key: "closingCredit",
    label: "期末贷方",
    defaultVisible: true,
    align: "right",

    cell: row => formatFinanceAmount(row.closingCredit)
  }, {
    key: "net",
    label: "净值",
    defaultVisible: true,
    align: "right",
     emphasis: "medium",
    cell: row => <span className={row.net < 0 ? "text-red-600" : "text-slate-700"}>
          {formatFinanceAmount(Math.abs(row.net))}
        </span>
  }, {
    key: "status",
    label: "状态",
    defaultVisible: true,
    cell: row => {
      if (row.status === "excluded") return { kind: "badge", label: "已排除", tone: "gray" };
      if (row.status === "subtractOnly") return { kind: "badge", label: `仅减项 → ${row.subtractSourceLine ?? "?"}`, tone: "yellow" };
      return { kind: "badge", label: "未映射", tone: "red" };
    }
  }];
}
export default function UnmappedTab() {
  const sections = useUnmappedSections();
  return <PageSurface kind="standard" embedded body={createPageBody(sections)} />;
}

export function useUnmappedSections(): BodySurfaceSectionSpec[] {
  const {
    company,
    year
  } = useStatementConfig();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLineLabelMap] = useState<Map<string, string>>(new Map());
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(workspacePath(`/api/modules/finance/statement-config?companyCode=${company}&year=${year}`));
    if (!res.ok) {
      setError(`请求失败 (${res.status})`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    // Build lineCode → label map
    const llm = new Map<string, string>();
    for (const l of data.lineConfigs || []) llm.set(l.lineCode, l.label);
    setLineLabelMap(llm);
    const result: DisplayItem[] = [];
    const walk = (ns: Node[]) => {
      for (const n of ns) {
        const hasBalance = Math.abs(n.closingDebit) > 0.01 || Math.abs(n.closingCredit) > 0.01;
        if (!hasBalance) {
          walk(n.children);
          continue;
        }
        if (n.effectiveOperator === "add") {
          walk(n.children);
          continue;
        }
        if (n.effectiveOperator === "exclude") {
          result.push({
            accountCode: n.accountCode,
            accountName: n.accountName,
            level: n.level,
            closingDebit: n.closingDebit,
            closingCredit: n.closingCredit,
            net: n.net,
            status: "excluded",
            subtractSourceLine: null
          });
        } else if (n.effectiveOperator === "subtract") {
          result.push({
            accountCode: n.accountCode,
            accountName: n.accountName,
            level: n.level,
            closingDebit: n.closingDebit,
            closingCredit: n.closingCredit,
            net: n.net,
            status: "subtractOnly",
            subtractSourceLine: n.resolvedLineCode
          });
        } else if (n.mappingSource === "none") {
          result.push({
            accountCode: n.accountCode,
            accountName: n.accountName,
            level: n.level,
            closingDebit: n.closingDebit,
            closingCredit: n.closingCredit,
            net: n.net,
            status: "unmapped",
            subtractSourceLine: null
          });
        }
        walk(n.children);
      }
    };
    if (data.mappingPreview) walk(data.mappingPreview);
    setItems(result.sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
    setLoading(false);
  }, [company, year]);

  useEffect(() => {
    load();
  }, [load]);
  if (loading) return [createUnmappedRecordsSection("加载中...")];
  if (error) {
    return createUnmappedErrorSections(error, load);
  }
  const subtractOnly = items.filter(a => a.status === "subtractOnly");
  const unmappedOnly = items.filter(a => a.status === "unmapped");
  const excluded = items.filter(a => a.status === "excluded");
  if (items.length === 0) return [createUnmappedRecordsSection("全部科目已正常归属，当前没有余额非零但未被 add 消费的科目。")];
  return [
    createMessageSection("unmapped-summary", {
      tone: "muted",
      content: (
        <div className="flex flex-wrap gap-4">
          <span>未映射: <b className="text-red-500">{unmappedOnly.length}</b></span>
          {subtractOnly.length > 0 && <span>仅减项: <b className="text-amber-600">{subtractOnly.length}</b></span>}
          {excluded.length > 0 && <span>已排除: <b className="text-gray-600">{excluded.length}</b></span>}
          <span className="text-gray-400">（余额非零但未被 add 消费）</span>
        </div>
      ),
    }),
    createUnmappedTableSection(items),
  ];
}

function createUnmappedRecordsSection(message: string): BodySurfaceSectionSpec {
  return createRecordSection("unmapped-records", { records: [], empty: message });
}

function createUnmappedErrorSections(message: string, onRetry: () => void): BodySurfaceSectionSpec[] {
  return [
    createMessageSection("error", {
      tone: "danger",
      content: message
    }),
    {
      key: "retry",
      body: { kind: "form", form: {
        kind: "filters",
        content: { items: [] },
        commands: [{ key: "retry", label: "重试", variant: "danger", onClick: onRetry }],
      } },
    },
  ];
}

function createUnmappedTableSection(items: DisplayItem[]): BodySurfaceSectionSpec {
  const columns = createUnmappedColumns();

  return createPageDataSection("unmapped-table", {
          kind: "table",
          rows: items,
          columns,
          visibleColumns: columns.map(column => column.key),
          rowKey: row => row.accountCode,

          rowState: row => row.status === "unmapped" ? "danger" : row.status === "excluded" ? "muted" : "warning",
        });
}
