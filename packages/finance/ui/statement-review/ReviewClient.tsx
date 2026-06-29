"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBlockSurfaceBlock, PageSurface, createPageDataBlock, createPageTableBlock } from "@workspace/core/ui";
import type { DataSurfaceColumnSpec, PageSurfaceBlockSpec, SurfaceToolbarItem, SurfaceToolbarItems } from "@workspace/core/ui";
import { useReviewFilterToolbarItems } from "./ReviewFilters";
import type { RvLine } from "@workspace/finance/types";

interface WpLine { id: number; lineCode: string; manualAmount: number; importedAmount: number; }
interface Workpaper { id: number; lines: WpLine[]; }
interface Review { id: number; status: string; isStale: boolean; lines: RvLine[]; }
interface LineState { adjustedAmount: number | null; status: string; comment: string | null; finalAmount: number; }
type Edits = Map<string, { adjustedAmount: number | null; status: string; comment: string | null }>;

const RT_SET = new Set(["incomeStatement", "cashFlow"]);
const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "待确认",
  confirmed: "已确认",
  adjusted: "已调整",
  flagged: "已标记",
};

function formatAmount(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rtFromQuery = searchParams.get("reportType");
  const [co, setCo] = useState(searchParams.get("companyCode") || "02");
  const [yr, setYr] = useState(searchParams.get("year") || "2025");
  const [mo, setMo] = useState(searchParams.get("month") || "6");
  const [rt, setRt] = useState(rtFromQuery && RT_SET.has(rtFromQuery) ? rtFromQuery : "incomeStatement");
  const [wp, setWp] = useState<Workpaper | null>(null);
  const [rv, setRv] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingAmt, setEditingAmt] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState("");
  const [editingCmt, setEditingCmt] = useState<string | null>(null);
  const [editCmt, setEditCmt] = useState("");
  const [edits, setEdits] = useState<Edits>(new Map());

  function clear() {
    setWp(null);
    setRv(null);
    setEdits(new Map());
    setError(null);
  }

  const loadWp = useCallback(async () => {
    setLoading(true);
    setError(null);
    clear();
    const response = await fetch(workspacePath(`/api/modules/finance/statement-review/workpapers?companyCode=${co}&year=${yr}&month=${mo}&reportType=${rt}`));
    if (!response.ok) {
      setError(`加载底稿失败 (${response.status})`);
      setLoading(false);
      return;
    }
    const result = await response.json();
    setWp(result.id ? result : { ...result, id: 0 });
    if (result.id) {
      const reviewResponse = await fetch(workspacePath(`/api/modules/finance/statement-review/reviews?workpaperId=${result.id}`));
      if (reviewResponse.ok) {
        const reviewResult = await reviewResponse.json();
        if (reviewResult.review) setRv(reviewResult.review);
      }
    }
    setLoading(false);
  }, [co, mo, rt, yr]);

  const generate = async () => {
    if (!wp?.id) return;
    setLoading(true);
    setError(null);
    const response = await fetch(workspacePath("/api/modules/finance/statement-review/reviews"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workpaperId: wp.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "生成校对失败");
      setLoading(false);
      return;
    }
    setRv(result.review);
    setEdits(new Map());
    setLoading(false);
  };

  const saveEdits = async () => {
    if (!rv || edits.size === 0) return;
    setSaving(true);
    setError(null);
    const lines = [...edits.entries()].map(([lineCode, edit]) => ({ lineCode, ...edit }));
    const response = await fetch(workspacePath(`/api/modules/finance/statement-review/reviews/${rv.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "保存失败");
      setSaving(false);
      return;
    }
    setRv(result.review);
    setEdits(new Map());
    setSaving(false);
  };

  const doConfirm = async () => {
    if (!rv) return;
    setSaving(true);
    setError(null);
    const response = await fetch(workspacePath(`/api/modules/finance/statement-review/reviews/${rv.id}/confirm`), { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "确认失败");
      setSaving(false);
      return;
    }
    setRv(result.review);
    setSaving(false);
  };

  function getLineState(line: RvLine): LineState {
    const edit = edits.get(line.lineCode);
    return {
      adjustedAmount: edit ? edit.adjustedAmount : line.adjustedAmount,
      status: edit ? edit.status : line.status,
      comment: edit ? edit.comment : line.comment,
      finalAmount: edit && edit.adjustedAmount != null ? edit.adjustedAmount : (edit && edit.adjustedAmount === null ? line.workpaperAmount : line.finalAmount),
    };
  }

  function upsertEdit(line: RvLine, patch: Partial<{ adjustedAmount: number | null; status: string; comment: string | null }>) {
    setEdits((previous) => {
      const next = new Map(previous);
      const current = getLineState(line);
      const base = next.get(line.lineCode) || { adjustedAmount: current.adjustedAmount, status: current.status, comment: current.comment };
      if (patch.adjustedAmount !== undefined) base.adjustedAmount = patch.adjustedAmount;
      if (patch.status !== undefined) base.status = patch.status;
      if (patch.comment !== undefined) base.comment = patch.comment;
      next.set(line.lineCode, base);
      return next;
    });
  }

  const commitAmt = (line: RvLine) => {
    const value = editAmt.trim();
    const adjustedAmount: number | null = value === "" ? null : parseFloat(value);
    if (value !== "" && (Number.isNaN(adjustedAmount) || !Number.isFinite(adjustedAmount))) {
      setEditingAmt(null);
      return;
    }
    const current = getLineState(line);
    const status = adjustedAmount != null ? "adjusted" : (current.status === "adjusted" ? "confirmed" : undefined);
    upsertEdit(line, { adjustedAmount, ...(status !== undefined ? { status } : {}) });
    setEditingAmt(null);
  };

  const commitCmt = (line: RvLine) => {
    upsertEdit(line, { comment: editCmt.trim() || null });
    setEditingCmt(null);
  };

  const toggleStatus = (line: RvLine) => {
    if (rv?.status === "confirmed") return;
    const current = getLineState(line).status;
    const next = current === "pending" ? "confirmed" : current === "confirmed" ? "flagged" : "pending";
    upsertEdit(line, { status: next });
  };

  const isReadOnly = rv?.status === "confirmed";
  const changedCount = edits.size;
  const hasFlaggedWithoutComment = rv ? rv.lines.some((line) => {
    const state = getLineState(line);
    return state.status === "flagged" && !state.comment;
  }) : false;
  const rawReviewItems: Array<SurfaceToolbarItem | null> = [
    wp
      ? {
          kind: "text",
          key: "loaded",
          section: "view",
          content: `底稿已加载${!wp.id ? "（空草稿，请先在底稿页录入数据）" : ""}`,
        }
      : null,
    rv
      ? {
          kind: "text",
          key: "status",
          section: "filter",
          content: (
            <span className="text-xs text-gray-500">
              校对状态：
              <b className={rv.status === "confirmed" && rv.isStale ? "text-amber-600" : rv.status === "confirmed" ? "text-emerald-600" : "text-blue-600"}>
                {rv.status === "confirmed" && rv.isStale ? "已过期" : rv.status === "confirmed" ? "已确认" : "草稿"}
              </b>
            </span>
          ),
        }
      : null,
    wp && wp.id > 0 && (!rv || rv.isStale)
      ? {
          kind: "action-group",
          key: "generate",
          actions: [{
            key: "generate",
            kind: "generate",
            label: rv?.isStale ? "重新生成校对" : "生成校对",
            variant: "primary" as const,
            disabled: loading,
            onClick: generate,
          }],
        }
      : null,
    rv && changedCount > 0
      ? {
          kind: "action-group",
          key: "save",
          actions: [{
            key: "save",
            kind: "save",
            label: `保存修改 (${changedCount})`,
            variant: "primary" as const,
            disabled: saving || isReadOnly,
            onClick: saveEdits,
          }],
        }
      : null,
    rv && rv.status !== "confirmed"
      ? {
          kind: "action-group",
          key: "confirm",
          actions: [{
            key: "confirm",
            kind: "check",
            label: "确认校对",
            variant: "primary" as const,
            disabled: saving || changedCount > 0,
            onClick: doConfirm,
          }],
        }
      : null,
  ];
  const reviewItems: SurfaceToolbarItems = rawReviewItems.filter((item): item is SurfaceToolbarItem => item !== null);
  const toolbarItems = useReviewFilterToolbarItems({
    co,
    yr,
    mo,
    rt,
    setCo,
    setYr,
    setMo,
    setRt,
    loading,
    onLoad: loadWp,
    extraItems: wp ? reviewItems : [],
  });
  const reviewBlocks: PageSurfaceBlockSpec[] = rv?.status === "confirmed" && !rv.isStale
    ? [
        createBlockSurfaceBlock("confirmed", {
          kind: "message",
          tone: "success",
          content: "校对已确认"
        }),
        {
          kind: "form",
          key: "view-report",
          surface: {
            kind: "inline",
            actions: [{
              key: "view-report",
              label: "前往财务报表查看最终结果",
              variant: "primary",
              onClick: () => router.push(`/finance/statements?companyCode=${co}&year=${yr}&month=${mo}&reportType=${rt === "incomeStatement" ? "income" : "cashflow"}`),
            }],
          },
        },
      ]
    : [];
  const alertBlocks: PageSurfaceBlockSpec[] = [
    ...(error ? [createPageDataBlock("review-error", { kind: "records", records: [], empty: error })] : []),
    ...(rv?.isStale ? [createPageDataBlock("review-stale", { kind: "records", records: [], empty: "底稿已更新，当前校对为旧快照；请点击「重新生成校对」更新校对。" })] : []),
    ...(hasFlaggedWithoutComment ? [createPageDataBlock("review-flagged-without-comment", { kind: "records", records: [], empty: "存在已标记(flagged)但未填写备注的行，请点击备注列填写标记原因。" })] : []),
  ];
  const reviewColumns: DataSurfaceColumnSpec<RvLine>[] = [{
    key: "label",
    label: "项目",
    required: true,
    emphasis: "medium",
    cell: (line) => line.label,
  }, {
    key: "systemAmount",
    label: "系统建议",
    required: true,
    align: "right", tone: "muted", width: "sm",

    cell: (line) => formatAmount(line.systemAmount),
  }, {
    key: "workpaperAmount",
    label: "底稿输入",
    required: true,
    align: "right", width: "sm",

    cell: (line) => formatAmount(line.workpaperAmount),
  }, {
    key: "adjustedAmount",
    label: "调整金额",
    required: true,
    align: "right", width: "sm",

    cell: (line) => {
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
          onKeyDown: (event) => {
            if (event.key === "Enter") commitAmt(line);
            if (event.key === "Escape") setEditingAmt(null);
          },
        };
      }
      return {
        kind: "action",
        action: {
          key: `edit-amount-${line.lineCode}`,
          label: state.adjustedAmount != null ? formatAmount(state.adjustedAmount) : "—",
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
    },
  }, {
    key: "finalAmount",
    label: "最终金额",
    required: true,
    align: "right", emphasis: "medium", width: "sm",

    cell: (line) => formatAmount(getLineState(line).finalAmount),
  }, {
    key: "status",
    label: "状态",
    required: true,
    align: "center", width: "xs",

    cell: (line) => {
      const status = getLineState(line).status;
      return {
        kind: "action",
        action: {
          key: `status-${line.lineCode}`,
          label: REVIEW_STATUS_LABELS[status] || status,
          size: "sm",
          disabled: isReadOnly,

          onClick: () => toggleStatus(line),
        },
      };
    },
  }, {
    key: "comment",
    label: "备注",
    required: true,
    width: "md",
    cell: (line) => {
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
          onKeyDown: (event) => {
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
    },
  }];
  const bodyBlocks: PageSurfaceBlockSpec[] = [
    ...reviewBlocks,
    ...alertBlocks,
    ...(rv
      ? [
          createPageTableBlock<RvLine>("review-lines", {
            framed: true,


            rows: rv.lines,
            columns: reviewColumns,
            visibleColumns: reviewColumns.map((column) => column.key),
            rowKey: (line) => line.lineCode,
            rowState: (line) => {
              const status = getLineState(line).status;
              if (status === "flagged") return "danger";
              if (status === "pending") return "warning";
              return "normal";
            },
          }),
        ]
      : []),
    ...(!wp && !loading ? [createPageDataBlock("review-empty", { kind: "records", records: [], empty: "选择筛选条件后点击「读取底稿」" })] : []),
    ...(loading ? [createPageDataBlock("review-loading", { kind: "records", records: [], empty: "加载中..." })] : []),
  ];

  return (
    <PageSurface
      kind="list"
      toolbar={{ items: toolbarItems }}
      body={{
        blocks: bodyBlocks,
      }}
    />
  );
}
