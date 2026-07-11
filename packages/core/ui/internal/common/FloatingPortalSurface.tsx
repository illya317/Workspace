"use client";

import { type CSSProperties, type ReactNode, type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FloatingPortalAlign = "left" | "right";

export interface FloatingPortalSurfaceProps {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: FloatingPortalAlign;
  className?: string;
  style?: CSSProperties;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  gap?: number;
  margin?: number;
  zIndex?: number;
  minWidth?: number;
  maxWidth?: number;
  matchTriggerWidth?: boolean;
  minHeightForFlip?: number;
}

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 8;
const DEFAULT_Z_INDEX = 60;
const DEFAULT_MIN_HEIGHT_FOR_FLIP = 160;

export default function FloatingPortalSurface({
  open,
  triggerRef,
  children,
  align = "left",
  className = "",
  style,
  surfaceRef,
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  zIndex = DEFAULT_Z_INDEX,
  minWidth,
  maxWidth,
  matchTriggerWidth = false,
  minHeightForFlip = DEFAULT_MIN_HEIGHT_FOR_FLIP,
}: FloatingPortalSurfaceProps) {
  const fallbackRef = useRef<HTMLDivElement | null>(null);
  const panelRef = surfaceRef ?? fallbackRef;
  const [positionStyle, setPositionStyle] = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportMaxWidth = Math.max(0, viewportWidth - margin * 2);
    const boundedMaxWidth = Math.max(0, Math.min(maxWidth ?? viewportMaxWidth, viewportMaxWidth));
    const measuredWidth = panelRef.current?.offsetWidth ?? triggerRect.width;
    const widthFloor = minWidth ?? (matchTriggerWidth ? triggerRect.width : 0);
    const desiredWidth = matchTriggerWidth
      ? triggerRect.width
      : Math.max(measuredWidth, triggerRect.width, widthFloor);
    const panelWidth = boundedMaxWidth > 0 ? Math.min(desiredWidth, boundedMaxWidth) : desiredWidth;
    const alignedLeft = align === "right" ? triggerRect.right - panelWidth : triggerRect.left;
    const left = Math.min(
      Math.max(alignedLeft, margin),
      Math.max(margin, viewportWidth - panelWidth - margin),
    );
    const spaceBelow = viewportHeight - triggerRect.bottom - gap - margin;
    const spaceAbove = triggerRect.top - gap - margin;
    const measuredHeight = panelRef.current?.offsetHeight ?? 0;
    const flipProbeHeight = Math.max(measuredHeight, minHeightForFlip);
    const placeAbove = flipProbeHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = Math.max(0, placeAbove ? spaceAbove : spaceBelow);

    setPositionStyle({
      position: "fixed",
      left,
      top: placeAbove ? undefined : triggerRect.bottom + gap,
      bottom: placeAbove ? viewportHeight - triggerRect.top + gap : undefined,
      width: matchTriggerWidth ? panelWidth : undefined,
      minWidth: Math.min(Math.max(minWidth ?? triggerRect.width, triggerRect.width), boundedMaxWidth || triggerRect.width),
      maxWidth: boundedMaxWidth || undefined,
      maxHeight: availableHeight,
      zIndex,
    });
  }, [align, gap, margin, matchTriggerWidth, maxWidth, minHeightForFlip, minWidth, panelRef, triggerRef, zIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const animationFrame = window.requestAnimationFrame(updatePosition);
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePosition)
      : null;
    if (panelRef.current) resizeObserver?.observe(panelRef.current);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, panelRef, triggerRef, updatePosition]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ ...positionStyle, ...style }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}
