"use client";

import Image from "next/image";
import { workspacePath } from "@workspace/core/routing";
import { PageSurface, createBlockSurfaceBlock, type PageSurfaceHeaderSpec, type PageSurfaceKind } from "@workspace/core/ui";
import NotificationBell from "@workspace/platform/ui/NotificationBell";
import UserMenu from "@workspace/platform/ui/UserMenu";
import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";

export interface ProductionQcPageChromeSpec {
  title: ReactNode;
  backHref: string;
  user: SessionUser;
}

export function productionQcPageHeader({
  title,
  backHref,
  user,
}: ProductionQcPageChromeSpec): PageSurfaceHeaderSpec {
  return {
    title,
    backHref,
    leading: (
      <a href={workspacePath("/portal")} className="flex-shrink-0 rounded-md p-0.5 transition hover:bg-gray-100">
        <Image
          src={workspacePath("/company/logo.png")}
          alt="Logo"
          width={28}
          height={28}
          className="h-7 w-auto object-contain"
        />
      </a>
    ),
    actions: (
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    ),
  };
}

export function ProductionQcPageSurface({
  title,
  backHref,
  user,
  kind = "detail",
  children,
}: ProductionQcPageChromeSpec & {
  kind?: Exclude<PageSurfaceKind, "split">;
  children: ReactNode;
}) {
  return (
    <PageSurface
      kind={kind}
      header={productionQcPageHeader({ title, backHref, user })}
      body={{
        blocks: [createBlockSurfaceBlock("production-qc-content", { kind: "content", content: children })],
      }}
    />
  );
}
