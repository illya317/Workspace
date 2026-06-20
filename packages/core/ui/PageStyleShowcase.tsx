"use client";

import { useState } from "react";
import AccordionTabBar from "./AccordionTabBar";
import { DatabasePageFrame } from "./PageFrames";
import { PanelCard } from "./BaseCards";
import ModuleTemplatePreview from "./page-style-preview/ModuleTemplatePreview";
import { moduleTemplates, pageStyleTabs } from "./page-style-preview/template-data";

export default function PageStyleShowcase() {
  const [activeTab, setActiveTab] = useState(moduleTemplates[0]?.key ?? "");
  const [activeChild, setActiveChild] = useState(moduleTemplates[0]?.pages[0]?.key ?? "");
  const activeModule = moduleTemplates.find((module) => module.key === activeTab) ?? moduleTemplates[0];

  function changeTab(nextKey: string) {
    const nextModule = moduleTemplates.find((module) => module.key === nextKey);
    setActiveTab(nextKey);
    setActiveChild(nextModule?.pages[0]?.key ?? "");
  }

  return (
    <DatabasePageFrame contentClassName="py-8">
      <PanelCard
        title="页面样式预览"
        bodyClassName="space-y-4 p-4"
      >
        <AccordionTabBar
          tabs={pageStyleTabs}
          activeTab={activeTab}
          activeChild={activeChild}
          onTabChange={changeTab}
          onChildChange={setActiveChild}
        />
        {activeModule && <ModuleTemplatePreview module={activeModule} activeChild={activeChild} />}
      </PanelCard>
    </DatabasePageFrame>
  );
}
