"use client";

import type { ReactNode } from "react";
import {
  PanelCard,
  Toolbar,
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
      <Toolbar
        className="mb-3 min-h-7 border-0 p-0 shadow-none"
        items={[
          {
            kind: "custom",
            key: "title",
            section: "view",
            content: <div className={getFieldGroupTitleClassName("mb-0")}>{title}</div>,
          },
          ...(actions
            ? [
                {
                  kind: "custom" as const,
                  key: "actions",
                  section: "action" as const,
                  content: <div className="flex shrink-0 items-center gap-2">{actions}</div>,
                },
              ]
            : []),
        ]}
      />
      {children}
    </PanelCard>
  );
}
