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
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-gray-50 text-gray-300 cursor-default"
          title={isChild ? "子资源已授权，父资源无直接授权" : state.source ? `来源: ${sourceLabel(state.source)}` : undefined}
        >
          <span className="opacity-60">✓</span>
          <span>{label}</span>
        </span>
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
