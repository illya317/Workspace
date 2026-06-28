"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { ActionGlyph, type ActionGlyphKind, announceFloatingOverlayOpen, createBlockSurfaceBlock, createPageBody, createPanelBlock, FLOATING_OVERLAY_OPEN_EVENT, getFloatingOverlayOpenDetail, PageSurface } from "@workspace/core/ui";
type NotificationItem = {
  id: number;
  title: string;
  body: string;
  href: string | null;
  isImportant: boolean;
  requiresAcknowledgement: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  actor: {
    name: string;
  } | null;
};
type NotificationResponse = {
  items: NotificationItem[];
  total: number;
  hasMore: boolean;
  unreadCount: number;
  pendingCount: number;
};
const PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 60_000;
const RECENT_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;
function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function formatNotificationTime(value: string) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "";
  const now = new Date();
  const diff = now.getTime() - timestamp;
  const clock = formatClock(date);
  if (diff >= 0 && diff < RECENT_TIME_WINDOW_MS) return `${WEEKDAY_LABELS[date.getDay()]} ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}-${date.getDate()} ${clock}`;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${clock}`;
}

function NotificationIconButton({
  kind,
  label,
  onClick,
  disabled,
  variant = "secondary",
  className = "",
}: {
  kind: ActionGlyphKind;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "secondary" | "primary" | "danger" | "dangerSolid";
  className?: string;
}) {
  const iconClassName = kind === "double-check" ? "h-5 w-5" : "h-4 w-4";
  const variantClassName =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-200"
      : variant === "dangerSolid"
        ? "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-200"
      : variant === "danger"
        ? "border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 disabled:bg-red-50 disabled:text-red-200"
        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-300";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md shadow-sm transition disabled:cursor-not-allowed ${variantClassName} ${className}`}
    >
      <ActionGlyph kind={kind} className={iconClassName} />
    </button>
  );
}

function mergeNotificationItems(current: NotificationItem[], next: NotificationItem[]) {
  const seen = new Set<number>();
  const merged: NotificationItem[] = [];
  for (const item of [...current, ...next]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
export default function NotificationBell({
  onBeforeNavigate
}: {
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
}) {
  const router = useRouter();
  const overlayId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const readingIdsRef = useRef<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationResponse>({ items: [], total: 0, hasMore: false, unreadCount: 0, pendingCount: 0 });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 56, right: 16 });
  const load = useCallback(async (offset = 0, append = false) => {
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications?limit=${PAGE_SIZE}&offset=${offset}`));
      if (!res.ok) return;
      const next = (await res.json()) as NotificationResponse;
      setData(current => append ? {
        ...next,
        items: mergeNotificationItems(current.items, next.items)
      } : next);
    } catch {
      // Network or parse errors are expected in offline/dev environments; keep current state.
    }
  }, []);
  useEffect(() => {
    void load(0);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(0), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  const updatePanelPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth;
    const panelWidth = Math.min(384, viewportWidth - 32);
    const preferredRight = viewportWidth - rect.right;
    const maxRight = Math.max(16, viewportWidth - panelWidth - 16);
    setPanelPosition({ top: rect.bottom + 8, right: Math.min(Math.max(16, preferredRight), maxRight) });
  }, []);
  useEffect(() => {
    function handleOverlayOpen(event: Event) {
      const detail = getFloatingOverlayOpenDetail(event);
      if (detail && detail.id !== overlayId) setOpen(false);
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener(FLOATING_OVERLAY_OPEN_EVENT, handleOverlayOpen);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(FLOATING_OVERLAY_OPEN_EVENT, handleOverlayOpen);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [overlayId]);
  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);
  async function updateNotification(id: number, action: "read" | "acknowledge" | "reject" | "clear") {
    setBusyId(id);
    try {
      await fetch(workspacePath(`/api/settings/account/notifications/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      await load(0);
    } catch {
      /* ignore network errors */
    } finally {
      setBusyId(null);
    }
  }
  async function markNotificationRead(item: NotificationItem) {
    if (item.readAt || readingIdsRef.current.has(item.id)) return;
    readingIdsRef.current.add(item.id);
    const readAt = new Date().toISOString();
    setData(current => ({
      ...current,
      unreadCount: Math.max(0, current.unreadCount - 1),
      items: current.items.map(entry => entry.id === item.id ? {
        ...entry,
        readAt
      } : entry)
    }));
    try {
      const res = await fetch(workspacePath(`/api/settings/account/notifications/${item.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" })
      });
      if (!res.ok) await load(0);
    } catch {
      await load(0);
    } finally {
      readingIdsRef.current.delete(item.id);
    }
  }
  async function clearNotifications() {
    setClearing(true);
    try {
      await fetch(workspacePath("/api/settings/account/notifications"), { method: "DELETE" });
      await load(0);
    } catch {
      /* ignore network errors */
    } finally {
      setClearing(false);
    }
  }
  async function markAllRead() {
    setMarkingRead(true);
    try {
      await fetch(workspacePath("/api/settings/account/notifications"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" })
      });
      await load(0);
    } catch {
      /* ignore network errors */
    } finally {
      setMarkingRead(false);
    }
  }
  async function openHref(item: NotificationItem) {
    if (!item.href) return;
    if (onBeforeNavigate && !(await onBeforeNavigate(item.href))) return;
    if (!item.readAt) await updateNotification(item.id, "read");
    setOpen(false);
    router.push(item.href);
  }
  const count = data.pendingCount || data.unreadCount;
  return <div ref={rootRef} className="relative">
      <button ref={buttonRef} type="button" aria-label="通知" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      const nextOpen = !open;
      setOpen(nextOpen);
      if (nextOpen) {
        announceFloatingOverlayOpen(overlayId);
        updatePanelPosition();
        void load();
      }
    }} className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {count > 9 ? "9+" : count}
          </span>}
      </button>

      {open && (
        <div
          className="z-50"
          style={{
            position: "fixed",
            top: panelPosition.top,
            right: panelPosition.right,
            width: "min(24rem, calc(100vw - 2rem))"
          }}
        >
          <PageSurface
            kind="settings"
            embedded
            body={createPageBody([createPanelBlock("notifications", {
              title: <div className="whitespace-nowrap text-sm font-semibold text-slate-900">通知</div>,
              subtitle: <div className="whitespace-nowrap text-xs text-slate-400">{data.pendingCount} 条待确认 · {data.unreadCount} 条未读 · 共 {data.total} 条</div>,
              bodyClassName: "max-h-96 overflow-y-auto !p-0",
              blocks: [
                createBlockSurfaceBlock("notification-actions", {
                  kind: "message",
                  className: "rounded-none border-x-0 border-t-0 border-slate-100 bg-white px-4 py-2 text-inherit",
                  content: (
                    <div className="flex items-center justify-end gap-2">
                      <NotificationIconButton kind="refresh" label="刷新" onClick={() => void load(0)} />
                      <NotificationIconButton kind="double-check" label="全部已读" disabled={markingRead || data.unreadCount === 0} onClick={() => void markAllRead()} />
                      <NotificationIconButton kind="delete-bin" label="清空已读" variant="danger" disabled={clearing || data.total === 0} onClick={() => void clearNotifications()} />
                    </div>
                  )
                }),
                createBlockSurfaceBlock("notification-list", {
                  kind: "message",
                  className: "border-0 bg-transparent p-0 text-inherit",
                  content: (
                    <>
                      {data.items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-400">暂无通知</p> : data.items.map(item => {
                        const pendingAcknowledgement = item.requiresAcknowledgement && !item.acknowledgedAt && !item.rejectedAt;
                        const unread = !item.readAt;
                        const itemToneClass = item.isImportant ? "bg-red-50/60" : unread ? "bg-sky-50/40" : "bg-white";
                        const titleToneClass = unread && item.isImportant ? "font-semibold text-red-600" : unread ? "font-semibold text-slate-950" : "font-medium text-slate-700";
                        const titleHoverClass = unread && item.isImportant ? "hover:text-red-700" : "hover:text-emerald-700";
                        return <div key={item.id} className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${itemToneClass}`} onMouseEnter={() => void markNotificationRead(item)}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      {unread && <span aria-label="未读" className="size-1.5 shrink-0 rounded-full bg-sky-500" />}
                                      {item.href ? <button type="button" className={`min-w-0 truncate text-left text-sm ${titleToneClass} ${titleHoverClass}`} onClick={() => void openHref(item)}>
                                          {item.title}
                                        </button> : <div className={`truncate text-sm ${titleToneClass}`}>{item.title}</div>}
                                      {item.rejectedAt ? <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-[11px] font-medium leading-none text-red-600">已拒绝</span> : item.acknowledgedAt ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium leading-none text-emerald-700">已确认</span> : pendingAcknowledgement ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium leading-none text-amber-700">待确认</span> : null}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-slate-600">{item.body}</div>
                                  </div>
                                  <NotificationIconButton
                                    kind="delete-bin"
                                    label="清除通知"
                                    disabled={busyId === item.id}
                                    className="!h-6 !w-6 !rounded-full !border-0 !bg-transparent !shadow-none !text-slate-300 hover:!bg-slate-100 hover:!text-slate-600 disabled:!text-slate-200"
                                    onClick={() => void updateNotification(item.id, "clear")}
                                  />
                                </div>
                                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                                  <div className="min-w-0 truncate text-left text-[11px] text-slate-400">
                                    {item.actor ? `${item.actor.name} · ` : ""}{formatNotificationTime(item.createdAt)}
                                  </div>
                                  {pendingAcknowledgement && (
                                    <div className="flex items-center gap-1.5">
                                      <NotificationIconButton kind="check" label="确认" variant="primary" disabled={busyId === item.id} className="!h-6 !w-6" onClick={() => void updateNotification(item.id, "acknowledge")} />
                                      <NotificationIconButton kind="x" label="拒绝" variant="dangerSolid" disabled={busyId === item.id} className="!h-6 !w-6" onClick={() => void updateNotification(item.id, "reject")} />
                                    </div>
                                  )}
                                </div>
                              </div>;
                      })}
                      {data.hasMore && <div className="border-t border-slate-100 px-4 py-3 text-center">
                          <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-900" onClick={() => void load(data.items.length, true)}>
                            更多
                          </button>
                        </div>}
                    </>
                  )
                }),
              ],
            })])}
          />
        </div>
      )}
    </div>;
}
