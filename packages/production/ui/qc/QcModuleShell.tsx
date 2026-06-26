"use client";

import AppShell from "@workspace/platform/ui/AppShell";
import { PageSurface } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";
import { useState } from "react";

interface QcPanel {
  title: string;
  eyebrow: string;
  items: string[];
}

interface QcViewTab {
  key: string;
  label: ReactNode;
  children?: QcViewTab[];
}

interface Props {
  user: SessionUser;
  title: string;
  description: string;
  activeResourceKey: string;
  backHref?: string;
  panels?: QcPanel[];
  viewTabs?: QcViewTab[];
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
      <PageSurface
        kind="list"
        tabs={tabs.length > 0 ? tabs : undefined}
        activeTab={activeTab}
        activeChild={activeChild}
        onTabChange={changeTab}
        onChildChange={setActiveChild}
        contentClassName="max-w-[min(1700px,calc(100vw-1rem))]"
        blocks={[
          ...(description ? [{
            kind: "message" as const,
            key: "summary",
            tone: "muted" as const,
            className: "border-0 bg-transparent px-0 py-0 text-gray-500",
            content: description,
          }] : []),
          ...(panels?.length ? [{
            kind: "surfaceGroup" as const,
            key: "panels",
            layout: "grid" as const,
            className: "md:grid-cols-3 lg:grid-cols-3",
            blocks: panels.map((panel) => ({
              kind: "data" as const,
              key: panel.title,
              surface: {
                kind: "table" as const,
                framed: true,
                title: panel.title,
                subtitle: panel.eyebrow,
                rows: panel.items.map((item) => ({ item })),
                columns: [
                  {
                    key: "item",
                    label: "事项",
                    required: true,
                    cell: (row: unknown) => {
                      const item = (row as { item: string }).item;
                      return (
                        <span className="flex gap-2 text-sm text-slate-600">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500" />
                          <span>{item}</span>
                        </span>
                      );
                    },
                  },
                ],
                rowKey: (row: unknown) => (row as { item: string }).item,
              },
            })),
          }] : []),
          ...(children ? [{
            kind: "moduleView" as const,
            key: "content",
            view: children,
          }] : []),
        ]}
      />
    </AppShell>
  );
}
