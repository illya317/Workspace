"use client";

import { DataSurface, FormSurface, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { AgentMessage } from "./types";

function stripMd(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/^#{1,6}\s+/gm, "");
}

/** 字段名映射 — 与 HR 花名册一致 */
const FIELD_LABELS: Record<string, string> = {
  employeeId: "工号",
  name: "姓名",
  alias: "别名",
  gender: "性别",
  education: "学历",
  title: "职称",
  phone: "电话",
  school: "毕业院校",
  major: "专业",
  hometown: "籍贯",
  total: "合计",
  // budget fields
  dept: "部门",
  account: "科目",
  months: "月度明细",
  expenseType: "费用类型",
  project: "项目",
  category: "类别",
  version: "版本",
  status: "状态",
  year: "年度",
  type: "类型",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

/** 需要隐藏的内部字段 */
const HIDDEN_FIELDS = new Set(["id"]);

interface Props {
  message: AgentMessage | null;
  onClose: () => void;
}

type AgentReportRow = Record<string, unknown> & { __rowIndex: number };

export default function AgentReportDrawer({ message, onClose }: Props) {
  if (!message?.data) return null;

  const data = message.data as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];
  const total = typeof data.total === "number" ? data.total : items.length;

  // 获取可见字段（排除内部字段）
  const visibleKeys = items.length > 0
    ? Object.keys(items[0] as Record<string, unknown>).filter((k) => !HIDDEN_FIELDS.has(k))
    : [];

  const rows = (items as Record<string, unknown>[]).map((item, index) => ({ ...item, __rowIndex: index }));
  const columns: DataSurfaceColumnSpec<AgentReportRow>[] = visibleKeys.map((key) => ({
    key,
    label: fieldLabel(key),
    required: true,
    cell: (row) => fmt(row[key]),
  }));

  // 格式化值
  function fmt(val: unknown): string {
    if (val == null) return "-";
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  }

  return (
    <FormSurface
      kind="modal"
      open
      title={`查询报告 · 共 ${total} 条记录`}
      onClose={onClose}
      maxWidth="max-w-5xl"
      fields={[
        {
          kind: "note" as const,
          key: "summary",
          content: <p className="whitespace-pre-wrap rounded-md border border-slate-200 p-3 text-sm text-slate-700">{stripMd(message.content)}</p>,
        },
        {
          kind: "note" as const,
          key: "table",
          content: rows.length > 0 ? (
            <DataSurface
              kind="table"
              framed
              rows={rows}
              columns={columns}
              visibleColumns={columns.map((column) => column.key)}
              density="compact"
              rowKey={(row) => row.__rowIndex}
            />
          ) : (
            <div className="rounded-md border border-slate-200 px-4 py-6 text-center text-sm text-slate-500">无详细数据</div>
          ),
        },
      ]}
    />
  );
}
