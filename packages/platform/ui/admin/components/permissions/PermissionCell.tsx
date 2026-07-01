"use client";

import { ActionGlyph, type ActionGlyphKind } from "@workspace/core/ui";
import { getPermissionActionGlyph, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { sourceTooltip } from "../../lib";
import PermissionCellButton from "./PermissionCellButton";

type PermissionSource = "direct" | "position" | "department" | "ancestor" | "implied" | "implicit" | "child" | null;

interface PermissionCellProps {
  state: {
    actionKey?: PermissionActionKey;
    has: boolean;
    source: PermissionSource | string;
  };
  disabled: boolean;
  onClick: () => void;
}

function sourceKind(source: PermissionSource | string) {
  if (source === "direct") return "direct";
  if (source === "position" || source === "department") return "organization";
  if (source === "ancestor" || source === "implied" || source === "implicit") return "common";
  return "derived";
}

export default function PermissionCell({
  state,
  disabled,
  onClick,
}: PermissionCellProps) {
  const icon = state.actionKey ? getPermissionActionGlyph(state.actionKey) as ActionGlyphKind : "add";
  if (disabled) {
    return <ActionGlyph kind={icon} className="mx-auto h-4 w-4 text-gray-300" />;
  }

  if (!state.has) {
    return (
      <PermissionCellButton tone="empty" icon={icon} label="授权" onClick={onClick} />
    );
  }

  const kind = sourceKind(state.source);
  const tooltip = sourceTooltip(state.source);
  if (kind === "direct") {
    return (
      <PermissionCellButton tone="direct" icon={icon} label="直接授权，点击取消" title={tooltip} onClick={onClick} />
    );
  }

  return (
    <PermissionCellButton
      tone={kind}
      icon={icon}
      label={`${tooltip}，点击直接授权`}
      title={tooltip}
      onClick={onClick}
    />
  );
}
