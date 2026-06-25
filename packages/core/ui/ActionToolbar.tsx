"use client";

import type { ReactNode } from "react";
import type { ActionGlyphKind } from "./ActionGlyphs";
import { joinClassNames } from "./card-utils";
import { Toolbar, type ToolbarItem } from "./Toolbar";

export type ActionToolbarAction = { label: string; kind: ActionGlyphKind; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; type?: "button" | "submit" };

export interface ActionToolbarProps {
  primaryActions?: ActionToolbarAction[];
  secondaryActions?: ActionToolbarAction[];
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export default function ActionToolbar({
  primaryActions = [],
  secondaryActions = [],
  leftSlot,
  rightSlot,
  className = "",
}: ActionToolbarProps) {
  const items: ToolbarItem[] = [];
  if (leftSlot) {
    items.push({
      kind: "custom",
      key: "left-slot",
      section: "view",
      content: <div className="min-w-0 text-base font-semibold text-slate-900">{leftSlot}</div>,
    });
  }
  const actions = [
    ...secondaryActions.map((action, index) => ({
      key: `secondary-${index}`,
      kind: action.kind,
      label: action.label,
      type: action.type,
      variant: action.variant,
      disabled: action.disabled,
      onClick: action.onClick,
    })),
    ...primaryActions.map((action, index) => ({
      key: `primary-${index}`,
      kind: action.kind,
      label: action.label,
      type: action.type,
      variant: action.variant ?? "primary",
      disabled: action.disabled,
      onClick: action.onClick,
    })),
  ];
  if (actions.length > 0) {
    items.push({
      kind: "action-group",
      key: "actions",
      section: "edit",
      actions,
    });
  }
  if (rightSlot) {
    items.push({ kind: "custom", key: "right-slot", section: "action", content: rightSlot });
  }

  return (
    <Toolbar
      items={items}
      className={joinClassNames("p-4", className)}
    />
  );
}
