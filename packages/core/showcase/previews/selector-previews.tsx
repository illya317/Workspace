"use client";

import { useState, type FC, type ReactNode } from "react";
import { matchText } from "@workspace/core/search";
import { Badge, SelectorPanel } from "../internal-ui";

function SelectorPanelListPreview() {
  const [selected, setSelected] = useState<string | null>("list-1");
  const items: Array<{ id: string; title: string; subtitle: string; trailing?: ReactNode; archived?: boolean }> = [
    { id: "list-1", title: "项目 Alpha", subtitle: "2026-06-01 创建", trailing: <Badge label="进行中" tone="emerald" /> },
    { id: "list-2", title: "项目 Beta", subtitle: "2026-05-20 创建", trailing: <Badge label="已完成" tone="slate" /> },
    { id: "list-3", title: "项目 Gamma", subtitle: "2025-12-01 归档", archived: true },
  ];
  return (
    <div className="max-w-xs">
      <SelectorPanel
        framed={false}
        items={items}
        selectedId={selected}
        onSelect={(item) => setSelected(item.id)}
        getKey={(item) => item.id}
        renderItem={(item) => ({
          title: item.title,
          subtitle: item.subtitle,
          trailing: item.trailing,
          archived: item.archived,
        })}
        size="sm"
        contentClassName="space-y-2"
      />
    </div>
  );
}

function SelectorPanelPreview() {
  const [selected, setSelected] = useState<string | null>("panel-1");
  const [search, setSearch] = useState("");
  const items: Array<{ id: string; group: string; title: string; subtitle: string; trailing?: ReactNode; archived?: boolean }> = [
    { id: "panel-1", group: "进行中", title: "项目 Alpha", subtitle: "2026-06-01 创建", trailing: <Badge label="进行中" tone="emerald" /> },
    { id: "panel-2", group: "进行中", title: "项目 Beta", subtitle: "2026-05-20 创建", trailing: <Badge label="进行中" tone="emerald" /> },
    { id: "panel-3", group: "已归档", title: "项目 Gamma", subtitle: "2025-12-01 归档", archived: true },
  ];
  const filtered = items.filter((item) => matchText(item.title, search));
  return (
    <div className="max-w-xs">
      <SelectorPanel
        items={filtered}
        selectedId={selected}
        onSelect={(item) => setSelected(item.id)}
        getKey={(item) => item.id}
        filter={{ kind: "search", value: search, onChange: setSearch, placeholder: "搜索项目..." }}
        groupBy={(item) => item.group}
        renderItem={(item) => ({
          title: item.title,
          subtitle: item.subtitle,
          trailing: item.trailing,
          archived: item.archived,
        })}
        size="sm"
        bodyClassName="p-3"
        contentClassName="space-y-4"
      />
    </div>
  );
}

function SelectorTreePreview() {
  type Node = { id: string; title: string; code?: string; children?: Node[] };
  const [selected, setSelected] = useState<string | null>("t-1");
  const items: Node[] = [
    {
      id: "t-1",
      title: "研发中心",
      code: "RD",
      children: [
        { id: "t-1-1", title: "前端组", code: "FE" },
        { id: "t-1-2", title: "后端组", code: "BE" },
      ],
    },
    {
      id: "t-2",
      title: "人力资源",
      code: "HR",
      children: [{ id: "t-2-1", title: "招聘组", code: "REC" }],
    },
  ];
  return (
    <div className="max-w-xs">
      <SelectorPanel
        mode="tree"
        items={items}
        selectedId={selected}
        onSelect={(item) => setSelected(item.id)}
        getKey={(item) => item.id}
        getChildren={(item) => item.children}
        renderItem={(item, ctx) => ({
          title: item.title,
          code: item.code,
          level: ctx.level,
        })}
        bodyClassName="p-3"
      />
    </div>
  );
}

export const selectorPreviewByName: Record<string, FC> = {
  SelectorList: SelectorPanelListPreview,
  SelectorPanel: SelectorPanelPreview,
  SelectorTree: SelectorTreePreview,
};
