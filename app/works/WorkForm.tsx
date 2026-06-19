"use client";

import { useState } from "react";
import SelectField from "@workspace/core/ui/SelectField";
import StarRating from "./StarRating";
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
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-gray-600">类别</label>
          <SelectField
            value={category}
            onChange={setCategory}
            options={[
              { value: "routine", label: "日常工作" },
              { value: "non-routine", label: "其他工作" },
            ]}
            selectClassName="w-auto min-w-28 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">
            工作内容 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none"
            placeholder="例如：会议纪要整理"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <StarRating
            value={importance}
            onChange={setImportance}
            label="重要度"
          />
          <StarRating value={urgency} onChange={setUrgency} label="紧急度" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-600">参与人</label>
          <input
            type="text"
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-400 focus:outline-none"
            placeholder="多个名字用逗号分隔"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                category,
                content,
                importance,
                urgency,
                participants,
                sortOrder: initial?.sortOrder ?? 0,
              })
            }
            disabled={!content.trim()}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {initial ? "保存" : "添加"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
