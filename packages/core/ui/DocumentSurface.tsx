"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { joinClassNames } from "./internal/common/card-utils";

export type DocumentSurfaceKind = "pages" | "viewer";

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

export interface DocumentSurfaceViewerSpec {
  src: string;
  title: string;
}

export interface DocumentSurfaceViewerProps {
  kind: "viewer";
  viewer: DocumentSurfaceViewerSpec;
}

export type DocumentSurfaceProps = DocumentSurfacePagesProps | DocumentSurfaceViewerProps;

const VIEWER_VIEWPORT_GUTTER = 24;
const VIEWER_MIN_HEIGHT = 320;
const A4_PORTRAIT_HEIGHT_RATIO = 297 / 210;

function pageClassName(page: DocumentSurfacePageSpec) {
  return joinClassNames(
    "mx-auto min-w-0",
    page.size === "a4" ? "w-[210mm] min-w-[210mm]" : "",
    page.size === "wide" ? "max-w-7xl" : "",
  );
}

export default function DocumentSurface(props: DocumentSurfaceProps) {
  if (props.kind === "viewer") {
    return <HostedDocumentViewer {...props.viewer} />;
  }
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

function HostedDocumentViewer({ src, title }: DocumentSurfaceViewerSpec) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    let animationFrame = 0;

    const updateHeight = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const bounds = hostRef.current?.getBoundingClientRect();
        if (!bounds) return;

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const viewportAvailableHeight = Math.floor(
          viewportHeight - Math.max(0, bounds.top) - VIEWER_VIEWPORT_GUTTER,
        );
        const a4Height = Math.ceil(bounds.width * A4_PORTRAIT_HEIGHT_RATIO);
        const nextHeight = Math.max(
          VIEWER_MIN_HEIGHT,
          viewportAvailableHeight,
          a4Height,
        );

        setHeight((current) => (current === nextHeight ? current : nextHeight));
      });
    };

    const resizeObserver = new ResizeObserver(updateHeight);
    const parent = hostRef.current?.parentElement;
    if (parent) resizeObserver.observe(parent);

    window.addEventListener("resize", updateHeight);
    window.visualViewport?.addEventListener("resize", updateHeight);
    updateHeight();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
      window.visualViewport?.removeEventListener("resize", updateHeight);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-inner"
      style={{ height: height ?? "calc(100dvh - 10rem)" }}
    >
      <iframe
        src={src}
        title={title}
        referrerPolicy="no-referrer"
        className="h-full w-full border-0 bg-white"
      />
    </div>
  );
}
