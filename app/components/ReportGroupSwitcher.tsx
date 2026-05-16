"use client";

import { useEffect, useState } from "react";

interface ReportGroup {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface Props {
  value: number | null;
  onChange: (group: ReportGroup | null) => void;
}

export default function ReportGroupSwitcher({ value, onChange }: Props) {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/report-groups/my")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.submitGroups || []) as ReportGroup[];
        setGroups(list);
        setLoading(false);

        // 如果只有一个，自动选中
        if (list.length === 1 && !value) {
          onChange(list[0]);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <span className="text-xs text-gray-400">加载中...</span>
    );
  }

  if (groups.length === 0) {
    return null;
  }

  if (groups.length === 1) {
    return (
      <span className="ml-2 text-xs text-gray-500">
        {groups[0].name}
      </span>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const id = parseInt(e.target.value);
        const group = groups.find((g) => g.id === id) || null;
        onChange(group);
      }}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none"
    >
      <option value="">选择周报部门</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
