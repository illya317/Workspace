"use client";

import { PageSurface, createBlockSurfaceSection, createPageBody } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";

export interface ProductionQcPageChromeSpec {
  title: ReactNode;
  backHref: string;
  user: SessionUser;
}

export function productionQcPageKind(_spec: ProductionQcPageChromeSpec): "standard" {
  return "standard";
}

export function ProductionQcPageSurface({
  title,
  backHref,
  user,
  children,
}: ProductionQcPageChromeSpec & {
  children: ReactNode;
}) {
  return (
    <PageSurface kind={productionQcPageKind({ title, backHref, user })}
      body={createPageBody([createBlockSurfaceSection("production-qc-content", { kind: "content", content: children })])}
    />
  );
}
