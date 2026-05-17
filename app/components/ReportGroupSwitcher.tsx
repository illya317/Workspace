"use client";

import { useEffect, useState } from "react";

interface Group {
  id: number;
  name: string;
  periodType: string;
}

interface Props {
  value: number | null;
  onChange: (group: Group | null) => void;
}

export default function ReportGroupSwitcher({ value, onChange }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/report-groups/my");
        if (res.ok) {
          const data = await res.json();
          const all = [
            ...(data.submitGroups || []),
            ...(data.viewGroups || []),
          ];
          // Deduplicate by id
          const map = new Map<number, Group>();
          for (const g of all) {
            if (!map.has(g.id)) map.set(g.id, g);
          }
          setGroups(Array.from(map.values()));
        }
      } catch (e) {
        console.error("ReportGroupSwitcher load failed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <span className="text-xs text-gray-400">加载中...</span>;
  }

  if (groups.length === 0) {
    return null;
  }

  const selected = groups.find((g) => g.id === value) || null;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const id = e.target.value ? parseInt(e.target.value) : null;
        const group = id ? groups.find((g) => g.id === id) || null : null;
        onChange(group);
      }}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-emerald-400 focus:outline-none"
    >
      <option value="">选择分组...</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
