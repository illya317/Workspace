"use client";

import { useState } from "react";
import AccordionTabBar from "./AccordionTabBar";
import { DatabasePageFrame } from "./PageFrames";
import { PanelCard } from "./BaseCards";
import ModuleTemplatePreview from "./page-style-preview/ModuleTemplatePreview";
import { getModuleSections, getPreviewPages, moduleTemplates, pageStyleTabs } from "./page-style-preview/template-data";

export default function PageStyleShowcase() {
  const firstModule = moduleTemplates[0];
  const firstSection = firstModule ? getModuleSections(firstModule)[0]?.key ?? "" : "";
  const [activeTab, setActiveTab] = useState(firstModule?.key ?? "");
  const [activeSection, setActiveSection] = useState(firstSection);
  const [activeTemplate, setActiveTemplate] = useState(firstModule ? getPreviewPages(firstModule, firstSection)[0]?.key ?? "" : "");
  const activeModule = moduleTemplates.find((module) => module.key === activeTab) ?? moduleTemplates[0];

  function changeTab(nextKey: string) {
    const nextModule = moduleTemplates.find((module) => module.key === nextKey);
    setActiveTab(nextKey);
    if (!nextModule) return;
    const nextSection = getModuleSections(nextModule)[0]?.key ?? "";
    setActiveSection(nextSection);
    setActiveTemplate(getPreviewPages(nextModule, nextSection)[0]?.key ?? "");
  }

  function changeSection(nextSection: string) {
    setActiveSection(nextSection);
    if (activeModule) setActiveTemplate(getPreviewPages(activeModule, nextSection)[0]?.key ?? "");
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
          activeChild={activeSection}
          onTabChange={changeTab}
          onChildChange={changeSection}
        />
        {activeModule && (
          <ModuleTemplatePreview
            module={activeModule}
            sectionKey={activeSection}
            activeChild={activeTemplate}
            onActiveChildChange={setActiveTemplate}
          />
        )}
      </PanelCard>
    </DatabasePageFrame>
  );
}
