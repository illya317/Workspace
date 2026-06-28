"use client";

import { ActionGlyph } from "@workspace/core/ui";
import { sourceLabel } from "../../lib";
import PermissionCellButton from "./PermissionCellButton";

type PermissionSource = "direct" | "position" | "department" | "ancestor" | "implied" | "implicit" | "child" | null;

interface PermissionCellProps {
  state: {
    has: boolean;
    source: PermissionSource | string;
  };
  disabled: boolean;
  onClick: () => void;
}

function sourceKind(source: PermissionSource | string) {
  if (source === "position" || source === "department") return "organization";
  if (source === "direct") return "direct";
  return "derived";
}

export default function PermissionCell({
  state,
  disabled,
  onClick,
}: PermissionCellProps) {
  if (disabled) {
    return <ActionGlyph kind="delete-minus" className="mx-auto h-4 w-4 text-gray-300" />;
  }

  if (!state.has) {
    return (
      <PermissionCellButton tone="empty" icon="add" label="授权" onClick={onClick} />
    );
  }

  const kind = sourceKind(state.source);
  if (kind === "direct") {
    return (
      <PermissionCellButton tone="direct" icon="check" label="直接授权，点击取消" title="直接授权" onClick={onClick} />
    );
  }

  const isOrganization = kind === "organization";
  return (
    <PermissionCellButton
      tone={isOrganization ? "organization" : "derived"}
      icon={isOrganization ? "permission-organization" : "permission-derived"}
      label={`${sourceLabel(state.source || "")}，点击直接授权`}
      title={sourceLabel(state.source || "")}
      onClick={onClick}
    />
  );
}
