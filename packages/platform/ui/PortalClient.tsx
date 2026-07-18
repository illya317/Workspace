"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import { ModuleCard, ModuleGridPage } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import type { PortalSlot } from "../portal-preferences";
import {
  defaultPortalCardsForUser,
  defaultSlotsForUser,
  fetchPortalSlotSettings,
  portalCardsForUser,
} from "./portal-preferences";

export default function PortalClient({ user }: { user: SessionUser }) {
  return (
    <Suspense fallback={<PortalContent user={user} desktopMode="personalized" />}>
      <PortalContentFromUrl user={user} />
    </Suspense>
  );
}

function PortalContentFromUrl({ user }: { user: SessionUser }) {
  const searchParams = useSearchParams();
  const desktopMode = searchParams.get("desktop") === "default" ? "default" : "personalized";
  return <PortalContent user={user} desktopMode={desktopMode} />;
}

function PortalContent({ user, desktopMode }: { user: SessionUser; desktopMode: "personalized" | "default" }) {
  const [slots, setSlots] = useState<PortalSlot[]>(() => defaultSlotsForUser(user));
  const entries = desktopMode === "default" ? defaultPortalCardsForUser(user) : portalCardsForUser(user, slots);

  useEffect(() => {
    if (desktopMode === "default") return;
    let cancelled = false;
    fetchPortalSlotSettings()
      .then((settings) => {
        if (!cancelled) setSlots(settings.slots);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [desktopMode]);

  return (
    <ModuleGridPage
      title={process.env.NEXT_PUBLIC_APP_NAME || "工作台"}
      summary={`欢迎回来，${user.employeeName || user.username}`}
      leading={(
        <div className="relative flex min-h-28 w-full items-center overflow-hidden rounded-[1.75rem] bg-emerald-950 px-5 py-4 shadow-lg shadow-emerald-950/15 sm:min-h-0 sm:w-auto sm:overflow-visible sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none">
          <span aria-hidden="true" className="absolute -right-7 -top-10 h-28 w-28 rounded-full border border-white/10 bg-emerald-400/10 sm:hidden" />
          <span aria-hidden="true" className="absolute -bottom-12 right-14 h-24 w-24 rounded-full bg-cyan-300/10 blur-xl sm:hidden" />
          <div className="relative z-10 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <Image
              src={workspacePath("/company/logo.png")}
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={150}
              height={45}
              className="object-contain brightness-0 invert sm:brightness-100 sm:invert-0"
            />
            <div className="text-right text-white sm:hidden">
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-200">Workspace</div>
              <div className="mt-1 text-sm font-semibold">今日工作入口</div>
            </div>
          </div>
        </div>
      )}
      contentClassName="min-h-[calc(100dvh-4rem)]"
    >
      {entries.map(({ entry }) => (
        <ModuleCard
          key={entry.key}
          title={entry.label}
          description={entry.desc}
          icon={entry.icon}
          color={entry.color}
          href={workspacePath(entry.href)}
        />
      ))}
    </ModuleGridPage>
  );
}
