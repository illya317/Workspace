"use client";

export const FLOATING_OVERLAY_OPEN_EVENT = "workspace:floating-overlay-open";

export interface FloatingOverlayOpenDetail {
  id: string;
}

export function announceFloatingOverlayOpen(id: string) {
  window.dispatchEvent(
    new CustomEvent<FloatingOverlayOpenDetail>(FLOATING_OVERLAY_OPEN_EVENT, {
      detail: { id },
    }),
  );
}

export function getFloatingOverlayOpenDetail(event: Event): FloatingOverlayOpenDetail | null {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail as Partial<FloatingOverlayOpenDetail> | undefined;
  return typeof detail?.id === "string" ? { id: detail.id } : null;
}
