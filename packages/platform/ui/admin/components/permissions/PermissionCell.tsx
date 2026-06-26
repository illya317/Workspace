"use client";

import { FormSurface } from "@workspace/core/ui";
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
      return (
        <FormSurface
          kind="inline"
          actions={[{
            key: "inherited",
            label: <><span className="opacity-60">✓</span><span>{label}</span></>,
            onClick,
            size: "sm",
            className: `py-1 text-xs ${isChild ? "!px-2" : "!px-4"}`,
          }]}
        />
      );
    }
    return (
      <FormSurface
        kind="inline"
        actions={[{ key: "direct", label: "✓", variant: "primary", onClick, size: "sm", className: "px-2 py-1 text-xs" }]}
      />
    );
  }
  return (
    <FormSurface
      kind="inline"
      actions={[{ key: "grant", label: "+", onClick, size: "sm", className: "px-2 py-1 text-xs" }]}
    />
  );
}
