"use client";

import { useState } from "react";
import { FormSurface } from "@workspace/core/ui";
import type { WorkItem } from "./types";

export default function WorkForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WorkItem | null;
  onSave: (data: {
    category: string;
    content: string;
    importance: number;
    urgency: number;
    participants: string;
    sortOrder: number;
  }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(initial?.category || "routine");
  const [content, setContent] = useState(initial?.content || "");
  const [importance, setImportance] = useState(initial?.importance || 3);
  const [urgency, setUrgency] = useState(initial?.urgency || 3);
  const [participants, setParticipants] = useState(
    initial?.participants?.map((p) => p.name).join(",") || ""
  );

  return (
    <FormSurface
      kind="fields"
      columns={2}
      className="rounded-lg border border-slate-200 bg-white p-4"
      fields={[
        {
          key: "category",
          label: "类别",
          spec: { valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: [
            { value: "routine", label: "日常工作" },
            { value: "non-routine", label: "其他工作" },
          ] } },
          value: category,
          onChange: (value) => setCategory(value === "non-routine" ? "non-routine" : "routine"),
        },
        {
          key: "content",
          label: "工作内容",
          required: true,
          spec: { valueType: "string", editor: "input" },
          value: content,
          onChange: (value) => setContent(String(value ?? "")),
          placeholder: "例如：会议纪要整理",
        },
        {
          key: "importance",
          label: "重要度",
          spec: { valueType: "number", editor: "rating" },
          value: importance,
          onChange: (value) => setImportance(Number(value)),
          ratingLabel: "重要度",
        },
        {
          key: "urgency",
          label: "紧急度",
          spec: { valueType: "number", editor: "rating" },
          value: urgency,
          onChange: (value) => setUrgency(Number(value)),
          ratingLabel: "紧急度",
        },
        {
          key: "participants",
          label: "参与人",
          span: "wide",
          spec: { valueType: "string", editor: "input" },
          value: participants,
          onChange: (value) => setParticipants(String(value ?? "")),
          placeholder: "多个名字用逗号分隔",
        },
      ]}
      actions={[
        { key: "cancel", label: "取消", onClick: onCancel },
        {
          key: "save",
          label: initial ? "保存" : "添加",
          disabled: !content.trim(),
          variant: "primary",
          onClick: () =>
            onSave({
              category,
              content,
              importance,
              urgency,
              participants,
              sortOrder: initial?.sortOrder ?? 0,
            }),
        },
      ]}
    />
  );
}
