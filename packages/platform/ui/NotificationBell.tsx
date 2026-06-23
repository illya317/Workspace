"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { ActionButton } from "@workspace/core/ui";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string | null;
  isImportant: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  actor: { id: number; name: string; avatar?: string | null } | null;
};

type NotificationResponse = {
  items: NotificationItem[];
  total: number;
  hasMore: boolean;
  unreadCount: number;
  pendingCount: number;
};

const PAGE_SIZE = 5;

export default function NotificationBell({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationResponse>({ items: [], total: 0, hasMore: false, unreadCount: 0, pendingCount: 0 });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 56, right: 16 });

  const load = useCallback(async (offset = 0, append = false) => {
    const res = await fetch(workspacePath(`/api/settings/account/notifications?limit=${PAGE_SIZE}&offset=${offset}`));
    if (!res.ok) return;
    const next = await res.json() as NotificationResponse;
    setData((current) => append ? { ...next, items: [...current.items, ...next.items] } : next);
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  const updatePanelPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth;
    const panelWidth = Math.min(384, viewportWidth - 32);
    const preferredRight = viewportWidth - rect.right;
    const maxRight = Math.max(16, viewportWidth - panelWidth - 16);
    setPanelPosition({
      top: rect.bottom + 8,
      right: Math.min(Math.max(16, preferredRight), maxRight),
    });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
        body: JSON.stringify({ action }),
      });
      await load(0);
    } finally {
      setBusyId(null);
    }
  }

  async function clearNotifications() {
    setClearing(true);
    try {
      await fetch(workspacePath("/api/settings/account/notifications"), { method: "DELETE" });
      await load(0);
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
        body: JSON.stringify({ action: "markAllRead" }),
      });
      await load(0);
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
  const isProjectInvite = (item: NotificationItem) => item.type === "work.project.member.added" || item.type === "work.project.member.roleChanged";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="通知"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) {
            updatePanelPosition();
            void load();
          }
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-50 rounded-lg border border-slate-200 bg-white shadow-lg"
          style={{ top: panelPosition.top, right: panelPosition.right, width: "min(24rem, calc(100vw - 2rem))" }}
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-sm font-semibold text-slate-900">通知</div>
              <div className="whitespace-nowrap text-xs text-slate-400">{data.pendingCount} 条待确认 · {data.unreadCount} 条未读 · 共 {data.total} 条</div>
            </div>
            <button type="button" className="ml-auto whitespace-nowrap text-xs text-slate-400 hover:text-slate-700" onClick={() => void load(0)}>刷新</button>
            <button
              type="button"
              className="whitespace-nowrap text-xs text-slate-400 hover:text-slate-700 disabled:text-slate-300"
              disabled={markingRead || data.unreadCount === 0}
              onClick={() => void markAllRead()}
            >
              全部已读
            </button>
            <button
              type="button"
              className="whitespace-nowrap text-xs text-slate-400 hover:text-red-600 disabled:text-slate-300"
              disabled={clearing || data.total === 0}
              onClick={() => void clearNotifications()}
            >
              清空已读
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto py-1">
            {data.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">暂无通知</p>
            ) : (
              data.items.map((item) => {
                const pendingImportant = item.isImportant && !item.acknowledgedAt && !item.rejectedAt;
                const itemToneClass = pendingImportant
                  ? "bg-amber-50/50"
                  : item.readAt
                    ? "bg-white"
                    : "bg-sky-50/40";
                return (
                <div key={item.id} className={`border-b border-slate-100 px-4 py-3 last:border-b-0 ${itemToneClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {item.isImportant && (
                          <span title="重要通知" className="grid size-4 shrink-0 place-items-center rounded-full bg-amber-100 text-[10px] font-bold leading-none text-amber-700">!</span>
                        )}
                        <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">{item.body}</div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {item.actor ? `${item.actor.name} · ` : ""}{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </div>
                    </div>
                    {item.rejectedAt ? (
                      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">已拒绝</span>
                    ) : item.acknowledgedAt ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">已确认</span>
                    ) : pendingImportant ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">待确认</span>
                    ) : item.readAt ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">已读</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">未读</span>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    {item.href && (
                      <ActionButton className="h-8 px-3 py-1 text-[11px]" onClick={() => void openHref(item)}>
                        查看
                      </ActionButton>
                    )}
                    {pendingImportant && (
                      <ActionButton
                        variant="primary"
                        className="h-8 px-3 py-1 text-[11px]"
                        disabled={busyId === item.id}
                        onClick={() => void updateNotification(item.id, "acknowledge")}
                      >
                        确认
                      </ActionButton>
                    )}
                    {pendingImportant && isProjectInvite(item) && (
                      <ActionButton
                        variant="danger"
                        className="h-8 px-3 py-1 text-[11px]"
                        disabled={busyId === item.id}
                        onClick={() => void updateNotification(item.id, "reject")}
                      >
                        拒绝
                      </ActionButton>
                    )}
                    <ActionButton
                      className="h-8 px-3 py-1 text-[11px]"
                      disabled={busyId === item.id}
                      onClick={() => void updateNotification(item.id, "clear")}
                    >
                      清除
                    </ActionButton>
                  </div>
                </div>
                );
              })
            )}
            {data.hasMore && (
              <div className="border-t border-slate-100 px-4 py-3 text-center">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  onClick={() => void load(data.items.length, true)}
                >
                  更多
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
