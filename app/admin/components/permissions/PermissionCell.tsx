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

    if (isChild) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-gray-200 text-gray-500 border border-gray-300 cursor-default"
          title="子资源已授权，父资源无直接授权"
        >
          ✓
        </span>
      );
    }

    return (
      <button
        onClick={isInherited ? undefined : onClick}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
          isInherited
            ? "bg-gray-100 text-gray-500 cursor-default"
            : "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600"
        }`}
        title={state.source ? `来源: ${sourceLabel(state.source)}` : undefined}
      >
        {isInherited ? (
          <>
            <span className="opacity-60">✓</span>
            <span>继承</span>
          </>
        ) : (
          "✓"
        )}
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
