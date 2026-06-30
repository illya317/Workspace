"use client";

import { useCallback, useEffect, useRef, type ReactNode, type Ref } from "react";

export function BodySurfaceSectionFrame({
  autoReveal,
  children,
  className,
  itemRef,
}: {
  autoReveal?: boolean;
  children: ReactNode;
  className?: string;
  itemRef?: Ref<HTMLDivElement>;
}) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
    assignRef(itemRef, node);
  }, [itemRef]);
  useEffect(() => {
    if (!autoReveal) return;
    const frame = requestAnimationFrame(() => {
      internalRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoReveal]);
  if (itemRef || autoReveal) return <div ref={setRef} className={className}>{children}</div>;
  return <div className={className}>{children}</div>;
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, node: HTMLDivElement | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  ref.current = node;
}
