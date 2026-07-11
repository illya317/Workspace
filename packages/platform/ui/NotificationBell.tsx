"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";

type NotificationSummaryResponse = {
  unreadCount: number;
  pendingCount: number;
  tabCounts?: {
    workflowTodo?: number;
  };
};

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell({
  onBeforeNavigate
}: {
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
}) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(workspacePath("/api/settings/account/notifications?limit=1&category=all"));
      if (!res.ok) return;
      const next = (await res.json()) as NotificationSummaryResponse;
      setCount((next.pendingCount || 0) + (next.tabCounts?.workflowTodo || 0));
    } catch {
      // Keep the current badge in offline/dev environments.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function openInbox() {
    const href = "/settings/account?tab=inbox";
    if (onBeforeNavigate && !(await onBeforeNavigate(href))) return;
    window.dispatchEvent(new CustomEvent("account-settings-tab", { detail: "inbox" }));
    router.push(href);
  }

  return (
    <button
      type="button"
      aria-label="收件箱"
      onClick={() => void openInbox()}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
    >
      <Inbox aria-hidden="true" size={21} strokeWidth={2} />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );
}
