"use client";

import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";
import type { BodySurfaceSectionVisibility } from "../../BodySurface.types";
import { useBodySurfaceRevealToken } from "./BodySurfaceRevealContext";

export function BodySurfaceSectionFrame({
  children,
  className,
  itemRef,
  revealKey,
  visibility,
}: {
  children: ReactNode;
  className?: string;
  itemRef?: Ref<HTMLDivElement>;
  revealKey: string;
  visibility?: BodySurfaceSectionVisibility;
}) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const revealToken = useBodySurfaceRevealToken(revealKey);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
    assignRef(itemRef, node);
  }, [itemRef]);
  useEffect(() => {
    if (revealToken === 0) return;
    const frame = requestAnimationFrame(() => {
      internalRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealToken]);
  return <div ref={setRef} className={className} data-surface-visibility={visibility}>{children}</div>;
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  ref.current = node;
}
