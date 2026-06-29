"use client";

import type { ReactNode } from "react";
import { joinClassNames } from "./internal/common/card-utils";

export type DocumentSurfaceKind = "pages";

export interface DocumentSurfacePageSpec {
  key: string;
  content: ReactNode;
  size?: "a4" | "fluid" | "wide";
}

export interface DocumentSurfaceProps {
  kind: DocumentSurfaceKind;
  pages: DocumentSurfacePageSpec[];
}

function pageClassName(page: DocumentSurfacePageSpec) {
  return joinClassNames(
    "mx-auto min-w-0",
    page.size === "a4" ? "w-[210mm] min-w-[210mm]" : "",
    page.size === "wide" ? "max-w-7xl" : "",
  );
}

export default function DocumentSurface({ pages }: DocumentSurfaceProps) {
  if (!pages.length) return null;
  return (
    <div className="min-w-0 space-y-6">
      {pages.map((page) => (
        <div
          key={page.key}
          className={pageClassName(page)}
        >
          {page.content}
        </div>
      ))}
    </div>
  );
}
