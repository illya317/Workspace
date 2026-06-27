"use client";

import type { CSSProperties, ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export type DocumentSurfaceKind = "pages";

export interface DocumentSurfacePageSpec {
  key: string;
  content: ReactNode;
  size?: "a4" | "fluid";
  minWidth?: string;
  className?: string;
  style?: CSSProperties;
}

export interface DocumentSurfaceProps {
  kind: DocumentSurfaceKind;
  pages: DocumentSurfacePageSpec[];
  className?: string;
  pageClassName?: string;
  style?: CSSProperties;
}

function pageClassName(page: DocumentSurfacePageSpec, commonClassName?: string) {
  return joinClassNames(
    "mx-auto min-w-0",
    page.size === "a4" ? "w-[210mm] min-w-[210mm]" : "",
    commonClassName,
    page.className,
  );
}

export default function DocumentSurface({ pages, className, pageClassName: commonPageClassName, style }: DocumentSurfaceProps) {
  if (!pages.length) return null;
  return (
    <div className={joinClassNames("min-w-0 space-y-6", className)} style={style}>
      {pages.map((page) => (
        <div
          key={page.key}
          className={pageClassName(page, commonPageClassName)}
          style={{ minWidth: page.minWidth, ...page.style }}
        >
          {page.content}
        </div>
      ))}
    </div>
  );
}
