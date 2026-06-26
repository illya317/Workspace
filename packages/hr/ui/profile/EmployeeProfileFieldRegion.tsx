"use client";

import type { ReactNode } from "react";
import {
  FieldGrid,
  PanelCard,
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
      <div className="mb-3 flex min-h-7 items-center gap-3">
        <FieldGrid.GroupTitle className="mb-0 min-w-0">{title}</FieldGrid.GroupTitle>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </PanelCard>
  );
}
