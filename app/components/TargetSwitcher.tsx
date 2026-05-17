"use client";

import { useEffect, useState } from "react";

interface Target {
  id: number;
  name: string;
  company?: string | null;
}

interface Targets {
  departments: Target[];
  projects: Target[];
  positions: Target[];
}

interface Props {
  value: { targetType: string; targetId: number; targetName: string } | null;
  onChange: (target: { targetType: string; targetId: number; targetName: string } | null) => void;
}

const TYPE_LABELS: Record<string, string> = {
  department: "按部门",
  project: "按项目",
  position: "按岗位",
};

export default function TargetSwitcher({ value, onChange }: Props) {
  const [data, setData] = useState<Targets>({ departments: [], projects: [], positions: [] });
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState(value?.targetType || "department");

  useEffect(() => {
    fetch("/api/my-targets")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);

        // 有数据且未选中时自动选第一个有数据的类型
        if (!value) {
          for (const t of ["department", "project", "position"]) {
            const items = t === "department" ? d.departments : t === "project" ? d.projects : d.positions;
            if (items.length > 0) {
              setTargetType(t);
              onChange({ targetType: t, targetId: items[0].id, targetName: items[0].name });
              break;
            }
          }
        }
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <span className="text-xs text-gray-400">加载中...</span>;

  const items = targetType === "department" ? data.departments
    : targetType === "project" ? data.projects
    : data.positions;

  // Filter types that have items
  const availableTypes = Object.entries(TYPE_LABELS).filter(([t]) => {
    const list = t === "department" ? data.departments : t === "project" ? data.projects : data.positions;
    return list.length > 0;
  });

  if (availableTypes.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {/* Type selector */}
      {availableTypes.length > 1 ? (
        <select
          value={targetType}
          onChange={(e) => {
            const t = e.target.value;
            setTargetType(t);
            const list = t === "department" ? data.departments : t === "project" ? data.projects : data.positions;
            if (list.length > 0) {
              onChange({ targetType: t, targetId: list[0].id, targetName: list[0].name });
            }
          }}
          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-600 focus:border-emerald-400 focus:outline-none"
        >
          {availableTypes.map(([t, label]) => (
            <option key={t} value={t}>{label}</option>
          ))}
        </select>
      ) : (
        <span className="text-gray-500">{availableTypes[0]?.[1]}</span>
      )}

      {/* Target selector */}
      {items.length === 1 ? (
        <span className="text-gray-500">{items[0].name}</span>
      ) : (
        <select
          value={value?.targetId ?? ""}
          onChange={(e) => {
            const id = parseInt(e.target.value);
            const item = items.find((i) => i.id === id);
            if (item) onChange({ targetType, targetId: id, targetName: item.name });
          }}
          className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-gray-700 focus:border-emerald-400 focus:outline-none"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}{item.company ? ` (${item.company})` : ""}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
