"use client";

import { useState } from "react";
import { FormField, PanelCard, RatingControl, SelectField, TextField, Toolbar, type ToolbarItem } from "@workspace/core/ui";
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
          <SelectField
            value={category}
            onChange={(value) => setCategory(value === "non-routine" ? "non-routine" : "routine")}
            options={[
              { value: "routine", label: "日常工作" },
              { value: "non-routine", label: "其他工作" },
            ]}

          />
        </FormField>
        <FormField label="工作内容" required>
          <TextField
            value={content}
            onChange={setContent}

            placeholder="例如：会议纪要整理"
          />
        </FormField>
        <div className="flex flex-wrap gap-4">
          <RatingControl
            value={importance}
            onChange={setImportance}
            label="重要度"
          />
          <RatingControl value={urgency} onChange={setUrgency} label="紧急度" />
        </div>
        <FormField label="参与人">
          <TextField
            value={participants}
            onChange={setParticipants}

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
