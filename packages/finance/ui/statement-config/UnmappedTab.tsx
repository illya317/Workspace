"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";
import {
  ActionButton,
  DataTable,
  EmptyStateCard,
  PanelCard,
  StatusBadge,
  type DataTableColumn,
} from "@workspace/core/ui";
import { formatFinanceAmount } from "../formatters";
import { useStatementConfig } from "./StatementConfigContext";

interface Node {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  resolvedLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  effectiveOperator: "add" | "subtract" | "exclude" | null;
  children: Node[];
}

type Status = "unmapped" | "subtractOnly" | "excluded";

interface DisplayItem {
  accountCode: string; accountName: string; level: number;
  closingDebit: number; closingCredit: number; net: number;
  status: Status;
  subtractSourceLine: string | null;
}

const columns: DataTableColumn<DisplayItem>[] = [
  {
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-slate-600",
    render: (row) => row.accountCode,
  },
  {
    key: "accountName",
    label: "科目名称",
    required: true,
    render: (row) => row.accountName,
  },
  {
    key: "level",
    label: "层级",
    defaultVisible: true,
    headerClassName: "text-center",
    cellClassName: "text-center text-slate-500",
    render: (row) => `L${row.level}`,
  },
  {
    key: "closingDebit",
    label: "期末借方",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-slate-600",
    render: (row) => formatFinanceAmount(row.closingDebit),
  },
  {
    key: "closingCredit",
    label: "期末贷方",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right text-slate-600",
    render: (row) => formatFinanceAmount(row.closingCredit),
  },
  {
    key: "net",
    label: "净值",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right font-medium",
    render: (row) => (
      <span className={row.net < 0 ? "text-red-600" : "text-slate-700"}>
        {formatFinanceAmount(Math.abs(row.net))}
      </span>
    ),
  },
  {
    key: "status",
    label: "状态",
    defaultVisible: true,
    render: (row) => <UnmappedStatus item={row} />,
  },
];

function UnmappedStatus({ item }: { item: DisplayItem }) {
  if (item.status === "excluded") {
    return <StatusBadge label="已排除" variant="gray" />;
  }
  if (item.status === "subtractOnly") {
    return <StatusBadge label={`仅减项 → ${item.subtractSourceLine ?? "?"}`} variant="yellow" />;
  }
  return <StatusBadge label="未映射" variant="red" />;
}

export default function UnmappedTab() {
  const { company, year } = useStatementConfig();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLineLabelMap] = useState<Map<string, string>>(new Map());

  async function load() {
    setLoading(true); setError(null);
    const res = await fetch(workspacePath(`/api/finance/statement-config?companyCode=${company}&year=${year}`));
    if (!res.ok) { setError(`请求失败 (${res.status})`); setLoading(false); return; }
    const data = await res.json();
    // Build lineCode → label map
    const llm = new Map<string, string>();
    for (const l of (data.lineConfigs || [])) llm.set(l.lineCode, l.label);
    setLineLabelMap(llm);

    const result: DisplayItem[] = [];
    const walk = (ns: Node[]) => {
      for (const n of ns) {
        const hasBalance = Math.abs(n.closingDebit) > 0.01 || Math.abs(n.closingCredit) > 0.01;
        if (!hasBalance) { walk(n.children); continue; }

        if (n.effectiveOperator === "add") { walk(n.children); continue; }
        if (n.effectiveOperator === "exclude") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "excluded",
            subtractSourceLine: null,
          });
        } else if (n.effectiveOperator === "subtract") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "subtractOnly",
            subtractSourceLine: n.resolvedLineCode,
          });
        } else if (n.mappingSource === "none") {
          result.push({
            accountCode: n.accountCode, accountName: n.accountName, level: n.level,
            closingDebit: n.closingDebit, closingCredit: n.closingCredit, net: n.net,
            status: "unmapped",
            subtractSourceLine: null,
          });
        }
        walk(n.children);
      }
    };
    if (data.mappingPreview) walk(data.mappingPreview);
    setItems(result.sort((a, b) => a.accountCode.localeCompare(b.accountCode)));
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [company, year]);

  if (loading) return <EmptyStateCard compact>加载中...</EmptyStateCard>;
  if (error) {
    return (
      <PanelCard bodyClassName="space-y-3 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <ActionButton onClick={load} variant="danger">重试</ActionButton>
      </PanelCard>
    );
  }

  const subtractOnly = items.filter((a) => a.status === "subtractOnly");
  const unmappedOnly = items.filter((a) => a.status === "unmapped");
  const excluded = items.filter((a) => a.status === "excluded");

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyStateCard>全部科目已正常归属，当前没有余额非零但未被 add 消费的科目。</EmptyStateCard>
      ) : (
        <>
          <div className="flex gap-4 text-sm text-gray-500">
            <span>未映射: <b className="text-red-500">{unmappedOnly.length}</b></span>
            {subtractOnly.length > 0 && (
              <span>仅减项: <b className="text-amber-600">{subtractOnly.length}</b></span>
            )}
            {excluded.length > 0 && (
              <span>已排除: <b className="text-gray-600">{excluded.length}</b></span>
            )}
            <span className="text-gray-400">（余额非零但未被 add 消费）</span>
          </div>
          <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
            <DataTable
              rows={items}
              columns={columns}
              visibleColumns={columns.map((column) => column.key)}
              rowKey={(row) => row.accountCode}
              tableClassName="text-base"
              rowClassName={(row) =>
                row.status === "unmapped"
                  ? "bg-red-50/60"
                  : row.status === "excluded"
                    ? "bg-slate-50"
                    : "bg-amber-50/50"
              }
            />
          </PanelCard>
        </>
      )}
    </div>
  );
}
