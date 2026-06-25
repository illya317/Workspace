"use client";

import { getToolbarActionClassName } from "@workspace/core/ui";
import { sourceLabel } from "../../lib";
interface PermissionCellProps {
  state: {
    has: boolean;
    source: string | null;
  };
  disabled: boolean;
  onClick: () => void;
}
export default function PermissionCell({
  state,
  disabled,
  onClick
}: PermissionCellProps) {
  if (disabled) {
    return <span className="text-gray-300">—</span>;
  }
  if (state.has) {
    const isChild = state.source === "child";
    const isInherited = !isChild && state.source !== "direct";
    if (isChild || isInherited) {
      const label = isChild ? "子资源" : "继承";
      return <button type="button" onClick={onClick} title={isChild ? "子资源已授权，点击添加直接授权" : state.source ? `来源: ${sourceLabel(state.source)}，点击添加直接授权` : "点击添加直接授权"} className={[getToolbarActionClassName(), `py-1 text-xs ${isChild ? "!px-2" : "!px-4"}`].filter(Boolean).join(" ")}>
          <span className="opacity-60">✓</span>
          <span>{label}</span>
        </button>;
    }
    return <button type="button" onClick={onClick} title={state.source ? `来源: ${sourceLabel(state.source)}` : undefined} className={[getToolbarActionClassName("primary"), "px-2 py-1 text-xs"].filter(Boolean).join(" ")}>
        ✓
      </button>;
  }
  return <button type="button" onClick={onClick} title="点击授权" className={[getToolbarActionClassName(), "px-2 py-1 text-xs"].filter(Boolean).join(" ")}>
      +
    </button>;
}
