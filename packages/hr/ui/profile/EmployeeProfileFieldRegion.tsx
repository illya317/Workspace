"use client";

import type { ReactNode } from "react";
import {
  PageSurface,
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
  const header = actions ? (
    <div className="flex min-h-7 items-center gap-3">
      <div className="mb-0 min-w-0 text-sm font-semibold text-slate-900">{title}</div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  ) : title;

  return (
    <PageSurface
      embedded
      kind="detail"
      className={className}
      blocks={[
        {
          kind: "panel",
          key: "field-region",
          title: header,
          bodyClassName: "p-3",
          blocks: [{ kind: "moduleView", key: "content", view: children }],
        },
      ]}
    />
  );
}
