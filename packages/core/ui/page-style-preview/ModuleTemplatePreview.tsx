"use client";

import { useMemo, useState } from "react";
import AccordionTabBar from "../AccordionTabBar";
import PreviewToolbar from "./PreviewToolbar";
import { getPageGroups, getPageGroupTabs, getPreviewPages, type ModuleTemplate } from "./template-data";
import TemplateFooter from "./TemplateFooter";
import TemplateHeader from "./TemplateHeader";
import { TemplateBody } from "./template-bodies";

export default function ModuleTemplatePreview({
  module,
  activeChild,
  onActiveChildChange,
}: {
  module: ModuleTemplate;
  activeChild: string;
  onActiveChildChange: (key: string) => void;
}) {
  const previewPages = useMemo(() => getPreviewPages(module), [module]);
  const pageGroups = useMemo(() => getPageGroups(module), [module]);
  const pageGroupTabs = useMemo(() => getPageGroupTabs(module), [module]);
  const page = useMemo(
    () => previewPages.find((item) => item.key === activeChild) ?? previewPages[0] ?? module.pages[0],
    [activeChild, module.pages, previewPages],
  );
  const activeGroup = pageGroups.find((group) => group.pages.some((item) => item.key === page.key)) ?? pageGroups[0];
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
      {activeGroup && (
        <AccordionTabBar
          tabs={pageGroupTabs}
          activeTab={activeGroup.key}
          activeChild={page.key}
          onTabChange={(groupKey) => {
            const nextGroup = pageGroups.find((group) => group.key === groupKey);
            const nextPage = nextGroup?.pages[0];
            if (nextPage) onActiveChildChange(nextPage.key);
          }}
          onChildChange={onActiveChildChange}
        />
      )}

      <TemplateHeader module={module} page={page} />

      {page.kind !== "home" && (
        <PreviewToolbar
          listVisible={listVisible}
          onToggleList={page.kind === "split" || page.kind === "document" ? () => setListVisible((value) => !value) : undefined}
          onCreate={() => {}}
          totalLabel={page.kind === "table" ? "共 86 条" : "共 12 条"}
        />
      )}

      <TemplateBody module={module} page={page} listVisible={listVisible} />

      <TemplateFooter page={page} pageNumber={pageNumber} onPageChange={setPageNumber} />
    </div>
  );
}
