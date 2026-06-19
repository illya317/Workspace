"use client";

import { useEffect, useState } from "react";
import SelectField from "./SelectField";

interface Target {
  id: number;
  name: string;
  company?: string | null;
}

interface Targets {
  departments: Target[];
  projects: Target[];
  positions: Target[];
  users?: Target[];
}

interface Props {
  value: { targetType: string; targetId: number; targetName: string } | null;
  onChange: (target: { targetType: string; targetId: number; targetName: string } | null) => void;
}

// user:<id> is backend-reserved; 按个人 not exposed in UI until personal reports are a formal entry point
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
    fetch("/workspace/api/my-targets")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);

        // 有数据且未选中时自动选第一个有数据的类型
        if (!value) {
          for (const t of ["department", "project", "position"]) {
            const items = resolveItems(d, t);
            if (items.length > 0) {
              setTargetType(t);
              onChange({ targetType: t, targetId: items[0].id, targetName: items[0].name });
              break;
            }
          }
        }
      })
      .catch(() => setLoading(false));
  }, [value, onChange]);

  if (loading) return <span className="text-xs text-gray-400">加载中...</span>;

  function resolveItems(d: Targets, t: string): Target[] {
    if (t === "department") return d.departments;
    if (t === "project") return d.projects;
    if (t === "user") return d.users || [];
    return d.positions;
  }

  const items = resolveItems(data, targetType);

  // Filter types that have items
  const availableTypes = Object.entries(TYPE_LABELS).filter(([t]) => resolveItems(data, t).length > 0);

  if (availableTypes.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {/* Type selector */}
      {availableTypes.length > 1 ? (
        <SelectField
          value={targetType}
          onChange={(t) => {
            setTargetType(t);
            const list = resolveItems(data, t);
            if (list.length > 0) {
              onChange({ targetType: t, targetId: list[0].id, targetName: list[0].name });
            }
          }}
          options={availableTypes.map(([t, label]) => ({ value: t, label }))}
          selectClassName="min-h-6 min-w-20 px-1.5 py-0.5 text-xs text-gray-600"
        />
      ) : (
        <span className="text-gray-500">{availableTypes[0]?.[1]}</span>
      )}

      {/* Target selector */}
      {items.length === 1 ? (
        <span className="text-gray-500">{items[0].name}</span>
      ) : (
        <SelectField
          value={value?.targetId == null ? "" : String(value.targetId)}
          onChange={(nextValue) => {
            const id = parseInt(nextValue);
            const item = items.find((i) => i.id === id);
            if (item) onChange({ targetType, targetId: id, targetName: item.name });
          }}
          options={items.map((item) => ({
            value: String(item.id),
            label: `${item.name}${item.company ? ` (${item.company})` : ""}`,
          }))}
          selectClassName="min-h-6 min-w-28 px-1.5 py-0.5 text-xs text-gray-700"
        />
      )}
    </span>
  );
}
