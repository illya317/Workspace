"use client";

import type { ReactNode } from "react";
import {
  ActionToolbar,
  PanelCard,
  getFieldGroupTitleClassName,
} from "@workspace/core/ui";

export function FieldRegion({
  title,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <PanelCard className={className} bodyClassName="p-3">
      <ActionToolbar
        className="mb-3 min-h-7 border-0 p-0 shadow-none"
        leftSlot={<div className={getFieldGroupTitleClassName("mb-0")}>{title}</div>}
        rightSlot={actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : undefined}
      />
      {children}
    </PanelCard>
  );
}
