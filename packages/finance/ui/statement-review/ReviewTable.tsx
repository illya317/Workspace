"use client";

import { createPageBody, PageSurface, createPageTableSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
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
    emphasis: "medium",
    cell: line => line.label
  }, {
    key: "systemAmount",
    label: "系统建议",
    required: true,
    align: "right", tone: "muted", width: "sm",

    cell: line => FMT(line.systemAmount)
  }, {
    key: "workpaperAmount",
    label: "底稿输入",
    required: true,
    align: "right", width: "sm",

    cell: line => FMT(line.workpaperAmount)
  }, {
    key: "adjustedAmount",
    label: "调整金额",
    required: true,
    align: "right", width: "sm",

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
    align: "right", emphasis: "medium", width: "sm",

    cell: line => FMT(getLineState(line).finalAmount)
  }, {
    key: "status",
    label: "状态",
    required: true,
    align: "center", width: "xs",

    cell: line => {
      const status = getLineState(line).status;
      return {
        kind: "action",
        action: {
          key: `status-${line.lineCode}`,
          label: STS[status] || status,
          size: "sm",
          disabled: isReadOnly,

          onClick: () => toggleStatus(line),
        },
      };
    }
  }, {
    key: "comment",
    label: "备注",
    required: true,
    width: "md",
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
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([
      createPageTableSection("review-lines", {
        framed: true,


        rows: rv.lines,
        columns,
        visibleColumns: columns.map(column => column.key),
        rowKey: line => line.lineCode,
        rowState: line => {
          const status = getLineState(line).status;
          if (status === "flagged") return "danger";
          if (status === "pending") return "warning";
          return "normal";
        },
      }),
    ])}
  />
}
