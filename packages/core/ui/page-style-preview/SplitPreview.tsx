"use client";

import { useState } from "react";
import { PanelCard } from "../BaseCards";
import SelectorCard from "../SelectorCard";
import SplitWorkspace from "../SplitWorkspace";
import TextField from "../TextField";
import PreviewToolbar from "./PreviewToolbar";

const items = [
  { key: "ops", title: "生产中心", subtitle: "一级部门 / 112 人" },
  { key: "qc", title: "质量部", subtitle: "二级部门 / 48 人" },
  { key: "office", title: "行政部", subtitle: "一级部门 / 26 人" },
];

function SideList() {
  return (
    <PanelCard title="目录" bodyClassName="space-y-2 p-3">
      {items.map((item, index) => (
        <SelectorCard
          key={item.key}
          title={item.title}
          subtitle={item.subtitle}
          active={index === 0}
          onClick={() => {}}
        />
      ))}
    </PanelCard>
  );
}

export default function SplitPreview({ activeChild }: { activeChild: string }) {
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <PreviewToolbar
        listVisible={sideOpen}
        onToggleList={() => setSideOpen((value) => !value)}
        totalLabel={activeChild === "position" ? "共 42 岗" : "共 12 部门"}
      />
      <SplitWorkspace
        sideOpen={sideOpen}
        drawerOpen={drawerOpen}
        onDrawerOpenChange={setDrawerOpen}
        renderSide={() => <SideList />}
      >
        <PanelCard
          title={activeChild === "position" ? "岗位详情" : "部门详情"}
          bodyClassName="grid gap-3 p-4 md:grid-cols-2"
        >
          <TextField placeholder="名称" />
          <TextField placeholder="编码" />
          <TextField placeholder="上级" />
          <TextField placeholder="负责人" />
        </PanelCard>
      </SplitWorkspace>
    </div>
  );
}
