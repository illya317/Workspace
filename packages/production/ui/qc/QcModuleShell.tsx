"use client";

import AppShell from "@workspace/platform/ui/AppShell";
import { DatabasePageFrame } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";
import { useState } from "react";
import { PanelCard, type TabDef } from "@workspace/core/ui";

interface QcPanel {
  title: string;
  eyebrow: string;
  items: string[];
}

interface Props {
  user: SessionUser;
  title: string;
  description: string;
  activeResourceKey: string;
  backHref?: string;
  panels?: QcPanel[];
  viewTabs?: TabDef[];
  children?: ReactNode;
}

export default function QcModuleShell({ user, title, description, backHref = "/production", panels, viewTabs = [], children }: Props) {
  const tabs = viewTabs;
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");
  const [activeChild, setActiveChild] = useState<string | undefined>(tabs[0]?.children?.[0]?.key);

  function changeTab(key: string) {
    const nextTab = tabs.find((tab) => tab.key === key);
    setActiveTab(key);
    setActiveChild(nextTab?.children?.[0]?.key);
  }

  return (
    <AppShell title={title} backHref={backHref} user={user}>
      <DatabasePageFrame
        tabs={tabs.length > 0 ? tabs : undefined}
        activeTab={activeTab}
        activeChild={activeChild}
        onTabChange={changeTab}
        onChildChange={setActiveChild}
        contentClassName="max-w-[min(1700px,calc(100vw-1rem))]"
        summary={description ? <p className="text-sm text-gray-500">{description}</p> : null}
      >
        {!!panels?.length && (
          <section className="grid gap-4 md:grid-cols-3">
            {panels.map((panel) => (
              <PanelCard
                key={panel.title}
                title={panel.title}
                subtitle={panel.eyebrow}
                bodyClassName="p-5"
              >
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  {panel.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </PanelCard>
            ))}
          </section>
        )}

        {children}
      </DatabasePageFrame>
    </AppShell>
  );
}
