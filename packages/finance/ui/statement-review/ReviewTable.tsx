"use client";

import { PageSurface, createPageTableBlock, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { RvLine } from "@workspace/finance/types";
const FMT = (n: number) => n.toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const STS: Record<string, string> = {
  pending: "待确认",
  confirmed: "已确认",
  adjusted: "已调整",
  flagged: "已标记"
};
export interface LineState {
  adjustedAmount: number | null;
  status: string;
  comment: string | null;
  finalAmount: number;
}
interface Props {
  rv: {
    id: number;
    status: string;
    isStale: boolean;
    lines: RvLine[];
  };
  getLineState: (line: RvLine) => LineState;
  isReadOnly: boolean;
  editingAmt: string | null;
  setEditingAmt: (value: string | null) => void;
  editAmt: string;
  setEditAmt: (value: string) => void;
  commitAmt: (line: RvLine) => void;
  editingCmt: string | null;
  setEditingCmt: (value: string | null) => void;
  editCmt: string;
  setEditCmt: (value: string) => void;
  commitCmt: (line: RvLine) => void;
  toggleStatus: (line: RvLine) => void;
}
export default function ReviewTable({
  rv,
  getLineState,
  isReadOnly,
  editingAmt,
  setEditingAmt,
  editAmt,
  setEditAmt,
  commitAmt,
  editingCmt,
  setEditingCmt,
  editCmt,
  setEditCmt,
  commitCmt,
  toggleStatus
}: Props) {
  const columns: DataSurfaceColumnSpec<RvLine>[] = [{
    key: "label",
    label: "项目",
    required: true,
    className: "font-medium text-slate-800",
    cell: line => line.label
  }, {
    key: "systemAmount",
    label: "系统建议",
    required: true,
    className: "w-28 text-right text-slate-400",
    headerClassName: "text-right",
    cell: line => FMT(line.systemAmount)
  }, {
    key: "workpaperAmount",
    label: "底稿输入",
    required: true,
    className: "w-28 text-right text-slate-600",
    headerClassName: "text-right",
    cell: line => FMT(line.workpaperAmount)
  }, {
    key: "adjustedAmount",
    label: "调整金额",
    required: true,
    className: "w-28 text-right",
    headerClassName: "text-right",
    cell: line => {
      const state = getLineState(line);
      const isEditing = editingAmt === line.lineCode;
      if (isEditing) {
        return {
          kind: "input",
          spec: { valueType: "number", control: "text" },
          autoFocus: true,
          value: editAmt,
          onChange: (value) => setEditAmt(String(value ?? "")),
          onBlur: () => commitAmt(line),
          onKeyDown: event => {
            if (event.key === "Enter") commitAmt(line);
            if (event.key === "Escape") setEditingAmt(null);
          },
        };
      }
      return {
        kind: "action",
        action: {
          key: `edit-amount-${line.lineCode}`,
          label: state.adjustedAmount != null ? FMT(state.adjustedAmount) : "—",
          size: "sm",
          className: `${state.adjustedAmount != null ? "text-blue-600" : "text-gray-400"} border-0 bg-transparent px-1 py-0.5 shadow-none hover:bg-gray-100 disabled:bg-transparent`,
          disabled: isReadOnly,
          onClick: () => {
            if (!isReadOnly) {
              setEditingAmt(line.lineCode);
              setEditAmt(state.adjustedAmount != null ? String(state.adjustedAmount) : "");
            }
          },
        },
      };
    }
  }, {
    key: "finalAmount",
    label: "最终金额",
    required: true,
    className: "w-28 text-right font-medium text-slate-800",
    headerClassName: "text-right",
    cell: line => FMT(getLineState(line).finalAmount)
  }, {
    key: "status",
    label: "状态",
    required: true,
    className: "w-20 text-center",
    headerClassName: "text-center",
    cell: line => {
      const status = getLineState(line).status;
      return {
        kind: "action",
        action: {
          key: `status-${line.lineCode}`,
          label: STS[status] || status,
          size: "sm",
          disabled: isReadOnly,
          className: `px-1.5 py-0.5 text-xs ${status === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "adjusted" ? "border-blue-200 bg-blue-50 text-blue-700" : status === "flagged" ? "border-red-200 bg-red-100 text-red-700" : "border-gray-200 bg-gray-100 text-gray-500"}`,
          onClick: () => toggleStatus(line),
        },
      };
    }
  }, {
    key: "comment",
    label: "备注",
    required: true,
    className: "w-40",
    cell: line => {
      const state = getLineState(line);
      const isEditing = editingCmt === line.lineCode;
      if (isEditing) {
        return {
          kind: "input",
          spec: { valueType: "string", control: "text" },
          autoFocus: true,
          value: editCmt,
          onChange: (value) => setEditCmt(String(value ?? "")),
          onBlur: () => commitCmt(line),
          onKeyDown: event => {
            if (event.key === "Enter") commitCmt(line);
            if (event.key === "Escape") setEditingCmt(null);
          },
        };
      }
      return {
        kind: "action",
        action: {
          key: `comment-${line.lineCode}`,
          label: state.comment || (state.status === "flagged" ? "请填写标记原因…" : "—"),
          size: "sm",
          disabled: isReadOnly,
          className: `w-full justify-start border-0 bg-transparent px-1 py-0.5 text-left shadow-none hover:bg-gray-100 disabled:bg-transparent ${state.comment ? "text-gray-600" : state.status === "flagged" ? "text-red-400 italic" : "text-gray-300"}`,
          onClick: () => {
            if (!isReadOnly) {
              setEditingCmt(line.lineCode);
              setEditCmt(state.comment || "");
            }
          },
        },
      };
    }
  }];
  return <PageSurface
    kind="list"
    embedded
    blocks={[
      createPageTableBlock("review-lines", {
        framed: true,
        className: "overflow-hidden",
        bodyClassName: "overflow-x-auto",
        rows: rv.lines,
        columns,
        visibleColumns: columns.map(column => column.key),
        rowKey: line => line.lineCode,
        rowClassName: line => {
          const status = getLineState(line).status;
          if (status === "flagged") return "bg-red-50/50";
          if (status === "pending") return "bg-amber-50/30";
          return "";
        },
      }),
    ]}
  />
}
