"use client";

import { sourceLabel } from "../../lib";

interface PermissionCellProps {
  state: { has: boolean; source: string | null };
  disabled: boolean;
  onClick: () => void;
}

export default function PermissionCell({
  state,
  disabled,
  onClick,
}: PermissionCellProps) {
  if (disabled) {
    return <span className="text-gray-300">—</span>;
  }

  if (state.has) {
    const isChild = state.source === "child";
    const isInherited = !isChild && state.source !== "direct";

    if (isChild || isInherited) {
      const label = isChild ? "子资源" : "继承";
      return (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-600"
          title={isChild ? "子资源已授权，点击添加直接授权" : state.source ? `来源: ${sourceLabel(state.source)}，点击添加直接授权` : "点击添加直接授权"}
        >
          <span className="opacity-60">✓</span>
          <span>{label}</span>
        </button>
      );
    }

    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600"
        title={state.source ? `来源: ${sourceLabel(state.source)}` : undefined}
      >
        ✓
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-emerald-100 hover:text-emerald-600"
      title="点击授权"
    >
      +
    </button>
  );
}
