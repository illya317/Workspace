"use client";

import { useState } from "react";
import { FormField, InputControl, PanelCard, Toolbar, type ToolbarItem } from "@workspace/core/ui";
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
    <PanelCard bodyClassName="p-4">
      <div className="space-y-3">
        <FormField label="类别">
          <InputControl
            spec={{ valueType: "string", editor: "select", options: { source: "static", mode: "dropdown", items: [
              { value: "routine", label: "日常工作" },
              { value: "non-routine", label: "其他工作" },
            ] } }}
            value={category}
            onChange={(value) => setCategory(value === "non-routine" ? "non-routine" : "routine")}
          />
        </FormField>
        <FormField label="工作内容" required>
          <InputControl
            spec={{ valueType: "string", editor: "input" }}
            value={content}
            onChange={(value) => setContent(String(value ?? ""))}

            placeholder="例如：会议纪要整理"
          />
        </FormField>
        <div className="flex flex-wrap gap-4">
          <InputControl
            spec={{ valueType: "number", editor: "rating" }}
            value={importance}
            onChange={(value) => setImportance(Number(value))}
            ratingLabel="重要度"
          />
          <InputControl spec={{ valueType: "number", editor: "rating" }} value={urgency} onChange={(value) => setUrgency(Number(value))} ratingLabel="紧急度" />
        </div>
        <FormField label="参与人">
          <InputControl
            spec={{ valueType: "string", editor: "input" }}
            value={participants}
            onChange={(value) => setParticipants(String(value ?? ""))}

            placeholder="多个名字用逗号分隔"
          />
        </FormField>
        <Toolbar
          className="justify-end border-0 p-0 shadow-none"
          items={[
            {
              kind: "action-group",
              key: "actions",
              section: "edit",
              actions: [
                { key: "cancel", kind: "cancel", label: "取消", onClick: onCancel },
                {
                  key: "save",
                  kind: initial ? "save" : "add",
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
              ],
            },
          ] satisfies ToolbarItem[]}
        />
      </div>
    </PanelCard>
  );
}
