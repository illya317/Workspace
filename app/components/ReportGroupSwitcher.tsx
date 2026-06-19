"use client";

import { useEffect, useState } from "react";
import SelectField from "./SelectField";

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
        const res = await fetch("/workspace/api/report-groups/my");
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

  return (
    <SelectField
      value={value == null ? "" : String(value)}
      onChange={(nextValue) => {
        const id = nextValue ? parseInt(nextValue) : null;
        const group = id ? groups.find((g) => g.id === id) || null : null;
        onChange(group);
      }}
      placeholder="选择分组..."
      options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
      selectClassName="min-w-32 px-2 py-1 text-xs"
    />
  );
}
