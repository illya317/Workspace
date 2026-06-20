"use client";

import { useMemo, useState } from "react";
import AccordionTabBar from "../AccordionTabBar";
import PreviewToolbar from "./PreviewToolbar";
import { getPageGroups, getPageGroupTabs, getPreviewPages, OVERVIEW_TAB_KEY, type ModuleTemplate, type PageTemplate } from "./template-data";
import TemplateFooter from "./TemplateFooter";
import TemplateHeader from "./TemplateHeader";
import { TemplateBody } from "./template-bodies";

function shouldShowToolbar(page: ModuleTemplate["pages"][number]) {
  if (typeof page.toolbar === "boolean") return page.toolbar;
  return ["table", "split", "analysis", "document", "production", "upload"].includes(page.kind);
}

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
  const overviewPage: PageTemplate = useMemo(
    () => ({
      key: OVERVIEW_TAB_KEY,
      label: "模板总览",
      title: "模板层级",
      kind: "overview",
      toolbar: false,
    }),
    [],
  );
  const page = useMemo(
    () => activeChild === OVERVIEW_TAB_KEY ? overviewPage : previewPages.find((item) => item.key === activeChild) ?? previewPages[0] ?? module.pages[0],
    [activeChild, module.pages, overviewPage, previewPages],
  );
  const activeGroup = activeChild === OVERVIEW_TAB_KEY
    ? { key: OVERVIEW_TAB_KEY }
    : pageGroups.find((group) => group.pages.some((item) => item.key === page.key)) ?? pageGroups[0];
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
      <TemplateHeader page={page} />

      {activeGroup && (
        <AccordionTabBar
          tabs={pageGroupTabs}
          activeTab={activeGroup.key}
          activeChild={activeChild === OVERVIEW_TAB_KEY ? undefined : page.key}
          onTabChange={(groupKey) => {
            if (groupKey === OVERVIEW_TAB_KEY) {
              onActiveChildChange(OVERVIEW_TAB_KEY);
              return;
            }
            const nextGroup = pageGroups.find((group) => group.key === groupKey);
            const nextPage = nextGroup?.pages[0];
            if (nextPage) onActiveChildChange(nextPage.key);
          }}
          onChildChange={onActiveChildChange}
        />
      )}

      {shouldShowToolbar(page) && (
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
