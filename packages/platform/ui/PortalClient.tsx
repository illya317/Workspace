"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { workspacePath } from "@workspace/core/routing";
import { PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "../types";
import { getAccessibleModules } from "../module-nav";

export default function PortalClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const entries = getAccessibleModules(user);

  return (
    <PageSurface
      kind="settings"
      contentClassName="py-10"
      blocks={[{
        kind: "moduleGrid",
        key: "portal-grid",
        centered: true,
        title: process.env.NEXT_PUBLIC_APP_NAME || "工作台",
        summary: `欢迎，${user.employeeName || user.nickname}`,
        leading: (
          <Image
            src={workspacePath("/company/logo.png")}
            alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
            width={200}
            height={60}
            className="h-auto w-auto max-w-[200px] object-contain"
          />
        ),
        items: entries.map((entry) => ({
          key: entry.key,
          title: entry.label,
          description: entry.desc,
          icon: entry.icon,
          color: entry.color,
          onClick: () => router.push(entry.href),
        })),
      }]}
    />
  );
}
