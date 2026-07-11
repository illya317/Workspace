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
  const [slots, setSlots] = useState<PortalSlot[]>([]);
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
      summary={`欢迎，${user.employeeName || user.username}`}
      leading={(
        <Image
          src={workspacePath("/company/logo.png")}
          alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
          width={200}
          height={60}
          className="h-auto w-auto max-w-[200px] object-contain"
        />
      )}
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
