"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useMemo, useState } from "react";
import { DataTable, DetailModal, InputControl, PanelCard, type DataTableColumn } from "@workspace/core/ui";
import type { QcTemplateFeedbackItem, QcTemplateFeedbackState } from "@workspace/production/server/qc";
import { feedbackKey, selectionTitle, type FeedbackTarget } from "./types";

const FEEDBACK_FIELDS = [
  { key: "descriptionText", label: "描述文字" },
  { key: "tableLayout", label: "表格布局" },
  { key: "formulaCalculation", label: "公式计算" },
  { key: "autoFilledText", label: "文字自动填写" },
  { key: "other", label: "其他" },
] as const;

type FeedbackFieldKey = typeof FEEDBACK_FIELDS[number]["key"];

interface Props {
  target: FeedbackTarget | null;
  onClose: () => void;
  onSaved: (states: Record<string, QcTemplateFeedbackState>) => void;
}

interface FeedbackResponse {
  data?: QcTemplateFeedbackItem;
  items?: QcTemplateFeedbackItem[];
  list?: { states?: Record<string, QcTemplateFeedbackState> };
  error?: string;
}

const SECTION_LABELS: Array<[FeedbackFieldKey, string]> = FEEDBACK_FIELDS.map((field) => [field.key, field.label]);

interface FeedbackRow {
  id: string;
  item: QcTemplateFeedbackItem;
  targetType: "section" | "inline";
  targetId: string;
  content: string;
  resolved: boolean;
}

function isRowResolved(item: QcTemplateFeedbackItem, targetType: "section" | "inline", targetId: string) {
  if (targetType === "section") return item.sectionResolved?.[targetId as FeedbackFieldKey] ?? item.resolved === true;
  return item.inlineResolved?.[targetId] ?? item.resolved === true;
}

function feedbackRows(items: QcTemplateFeedbackItem[]): FeedbackRow[] {
  return items.flatMap((item) => {
    const sectionRows = SECTION_LABELS.flatMap(([key, label]) => {
      const value = item.sections?.[key]?.trim();
      return value ? [{
        id: `${item.key}:section:${key}`,
        item,
        targetType: "section" as const,
        targetId: key,
        content: `${label}：${value}`,
        resolved: isRowResolved(item, "section", key),
      }] : [];
    });
    const inlineRows = (item.inlineEntries || []).map((entry) => ({
      id: `${item.key}:inline:${entry.id}`,
      item,
      targetType: "inline" as const,
      targetId: entry.id,
      content: `${entry.target.label}：${entry.note}`,
      resolved: isRowResolved(item, "inline", entry.id),
    }));
    return [...sectionRows, ...inlineRows];
  });
}

function feedbackColumns(
  resolvingKey: string,
  setResolved: (row: FeedbackRow, resolved: boolean) => void,
): DataTableColumn<FeedbackRow>[] {
  return [
    {
      key: "user",
      label: "反馈人",
      required: true,
      render: (row) => <span className="font-medium text-slate-800">{row.item.userName || "未知"}</span>,
    },
    {
      key: "content",
      label: "反馈内容",
      required: true,
      render: (row) => <span className="whitespace-pre-wrap leading-6 text-slate-700">{row.content}</span>,
    },
    {
      key: "resolved",
      label: "已解决",
      required: true,
      render: (row) => (
        <div className="flex items-center justify-center gap-2 text-slate-700">
          <InputControl spec={{ valueType: "boolean", editor: "checkbox", state: resolvingKey === row.id ? "disabled" : "normal" }} value={row.resolved} onChange={(checked) => setResolved(row, Boolean(checked))} />
          <span>已解决</span>
        </div>
      ),
    },
  ];
}

export default function TemplateFeedbackModal({ target, onClose, onSaved }: Props) {
  const [items, setItems] = useState<QcTemplateFeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingKey, setResolvingKey] = useState("");
  const [error, setError] = useState("");
  const key = useMemo(() => target ? feedbackKey(target.context) : "", [target]);
  const rows = useMemo(() => feedbackRows(items), [items]);

  useEffect(() => {
    if (!target) return;
    setError("");
    setItems([]);
    setLoading(true);
    fetch(workspacePath(`/api/modules/production/qc-templates/feedback?key=${encodeURIComponent(key)}`))
      .then((res) => res.json() as Promise<FeedbackResponse>)
      .then((body) => {
        setItems(body.items ?? []);
      })
      .catch(() => setError("读取反馈失败"))
      .finally(() => setLoading(false));
  }, [key, target]);

  if (!target) return null;

  async function setResolved(row: FeedbackRow, resolved: boolean) {
    setResolvingKey(row.id);
    setError("");
    try {
      const response = await fetch(workspacePath("/api/modules/production/qc-templates/feedback"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: row.item.key,
          resolved,
          targetType: row.targetType,
          targetId: row.targetId,
        }),
      });
      const body = await response.json() as FeedbackResponse;
      if (!response.ok) throw new Error(body.error || "更新失败");
      if (body.data) setItems((current) => current.map((entry) => entry.key === body.data?.key ? body.data : entry));
      if (body.list?.states) onSaved(body.list.states);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setResolvingKey("");
    }
  }

  return (
    <DetailModal open title="反馈" onClose={onClose} maxWidth="max-w-4xl">
      <div className="max-h-[88vh] overflow-hidden">
        <div className="max-h-[calc(88vh-82px)] space-y-4 overflow-y-auto py-4">
          <PanelCard bodyClassName="px-3 py-3 text-sm text-slate-700">
            {selectionTitle(target)}
          </PanelCard>
          <PanelCard title="全部反馈" actions={<span className="text-xs text-slate-500">{loading ? "读取中" : `${rows.length} 条`}</span>}>
            <DataTable
              rows={rows}
              columns={feedbackColumns(resolvingKey, (row, resolved) => { void setResolved(row, resolved); })}
              visibleColumns={["user", "content", "resolved"]}
              rowKey={(row) => row.id}
              emptyText="暂无反馈。"
            />
          </PanelCard>
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        </div>
      </div>
    </DetailModal>
  );
}
