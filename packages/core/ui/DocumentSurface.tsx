"use client";

import type { ReactNode } from "react";
import { joinClassNames } from "./internal/common/card-utils";

export type DocumentSurfaceKind = "pages";

export interface DocumentSurfacePageSpec {
  key: string;
  content: ReactNode;
  size?: "a4" | "fluid" | "wide";
}

export interface DocumentSurfacePagesSpec {
  items: DocumentSurfacePageSpec[];
}

export interface DocumentSurfacePagesProps {
  kind: "pages";
  pages: DocumentSurfacePagesSpec;
}

export type DocumentSurfaceProps = DocumentSurfacePagesProps;

function pageClassName(page: DocumentSurfacePageSpec) {
  return joinClassNames(
    "mx-auto min-w-0",
    page.size === "a4" ? "w-[210mm] min-w-[210mm]" : "",
    page.size === "wide" ? "max-w-7xl" : "",
  );
}

export default function DocumentSurface(props: DocumentSurfaceProps) {
  const pages = props.pages.items;
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
