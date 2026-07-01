"use client";

import { useState } from "react";
import { createFieldsSection, createPageBody, PageSurface, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { WorkItem } from "./types";

type WorkFormProps = {
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
};

export function useWorkFormSection({
  initial,
  onSave,
  onCancel,
}: WorkFormProps): BodySurfaceSectionSpec {
  const [category, setCategory] = useState(initial?.category || "routine");
  const [content, setContent] = useState(initial?.content || "");
  const [importance, setImportance] = useState(initial?.importance || 3);
  const [urgency, setUrgency] = useState(initial?.urgency || 3);
  const [participants, setParticipants] = useState(
    initial?.participants?.map((p) => p.name).join(",") || ""
  );

  return createFieldsSection("work-form", [
    {
      key: "category",
      label: "类别",
      spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: [
        { value: "routine", label: "日常节点" },
        { value: "non-routine", label: "其他节点" },
      ] } },
      value: category,
      onChange: (value) => setCategory(value === "non-routine" ? "non-routine" : "routine"),
    },
    {
      key: "content",
      label: "节点内容",
      required: true,
      spec: { valueType: "string", control: "text" },
      value: content,
      onChange: (value) => setContent(String(value ?? "")),
      placeholder: "输入目标、关键结果或子任务",
    },
    {
      key: "importance",
      label: "重要度",
      spec: { valueType: "number", control: "rating" },
      value: importance,
      onChange: (value) => setImportance(Number(value)),
      ratingLabel: "重要度",
    },
    {
      key: "urgency",
      label: "紧急度",
      spec: { valueType: "number", control: "rating" },
      value: urgency,
      onChange: (value) => setUrgency(Number(value)),
      ratingLabel: "紧急度",
    },
    {
      key: "participants",
      label: "参与人",
      span: "wide",
      spec: { valueType: "string", control: "text" },
      value: participants,
      onChange: (value) => setParticipants(String(value ?? "")),
      placeholder: "多个名字用逗号分隔",
    },
  ], {
    layout: { columns: 2 },

    commands: [
      { key: "cancel", label: "取消", icon: "cancel", onClick: onCancel },
      {
        key: "save",
        label: initial ? "保存" : "添加节点",
        icon: initial ? "save" : "add",
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
    ],
  });
}

export default function WorkForm(props: WorkFormProps) {
  const section = useWorkFormSection(props);

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([section])}
    />
  );
}
