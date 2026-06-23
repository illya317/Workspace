"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { ActionButton, PageShell, useUnsavedChangesPrompt } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import type { ReactNode } from "react";

interface NavLinkDef { label: string; href: string; }

interface Props {
  title: string;
  backHref: string;
  backLabel?: string;
  /** 顶部栏的跨页导航链接（如工作汇报/工作清单/历史记录） */
  navLinks?: NavLinkDef[];
  hasUnsavedChanges?: boolean;
  user: SessionUser;
  children: ReactNode;
}

export default function AppShell({ title, backHref, backLabel, navLinks, hasUnsavedChanges = false, user, children }: Props) {
  const router = useRouter();
  const confirmNavigation = useUnsavedChangesPrompt(hasUnsavedChanges);

  async function navigate(href: string) {
    if (!(await confirmNavigation())) return;
    router.push(href);
  }

  return (
    <PageShell
      title={title}
      backLabel={backLabel}
      onBack={() => void navigate(backHref)}
      actions={navLinks?.map((link) => ({ label: link.label, onClick: () => void navigate(link.href) }))}
      leading={(
        <ActionButton
          onClick={() => void navigate("/portal")}
          className="flex-shrink-0 border-0 bg-transparent p-0 shadow-none hover:bg-transparent"
          aria-label="返回入口"
        >
          <Image
            src={workspacePath("/company/logo.png")}
            alt="Logo"
            width={28}
            height={28}
            className="h-7 w-auto object-contain"
          />
        </ActionButton>
      )}
      trailing={(
        <div className="flex items-center gap-2">
          <NotificationBell onBeforeNavigate={() => confirmNavigation()} />
          <UserMenu user={user} onBeforeNavigate={() => confirmNavigation()} />
        </div>
      )}
    >
      {children}
    </PageShell>
  );
}
