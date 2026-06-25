"use client";

import { useMemo, useState } from "react";
import TabBar from "../TabBar";
import PreviewToolbar from "./PreviewToolbar";
import { getPreviewPages, type ModuleTemplate, type PageTemplate, type PageViewDefinition } from "./template-data";
import TemplateFooter from "./TemplateFooter";
import TemplateHeader from "./TemplateHeader";
import { TemplateBody } from "./template-bodies";

function shouldShowToolbar(page: ModuleTemplate["pages"][number]) {
  if (typeof page.toolbar === "boolean") return page.toolbar;
  return ["table", "split", "analysis", "document", "production", "upload"].includes(page.kind);
}

export default function ModuleTemplatePreview({
  module,
  route,
  routeLabel,
  viewDefinition,
  activeView,
  activeChild,
  onActiveViewChange,
  onActiveChildChange,
}: {
  module: ModuleTemplate;
  route: string;
  routeLabel?: string;
  viewDefinition?: PageViewDefinition;
  activeView: string;
  activeChild?: string;
  onActiveViewChange: (key: string) => void;
  onActiveChildChange: (key: string | undefined) => void;
}) {
  const routeSection = routeLabel ?? viewDefinition?.label ?? module.overviewLabel;
  const previewPages = useMemo(() => getPreviewPages(module, routeSection), [module, routeSection]);
  const page = useMemo(() => findPreviewPage(module, previewPages, route, activeView, activeChild), [activeChild, activeView, module, previewPages, route]);
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
      <TemplateHeader page={page} />

      {viewDefinition && (
        <TabBar
          variant="large"
          accordion
          tabs={viewDefinition.views}
          active={activeView}
          activeChild={activeChild}
          onChange={onActiveViewChange}
          onChildChange={onActiveChildChange}
        />
      )}

      {shouldShowToolbar(page) && (
        <PreviewToolbar
          listVisible={listVisible}
          onToggleList={page.kind === "split" || page.kind === "document" ? () => setListVisible((value) => !value) : undefined}
          onCreate={() => {}}
          totalLabel={page.kind === "table" ? "共 86 条" : "共 12 条"}
          showPreviewAction={page.previewAction}
        />
      )}

      <TemplateBody module={module} page={page} listVisible={listVisible} />

      {page.footer !== false && <TemplateFooter page={page} pageNumber={pageNumber} onPageChange={setPageNumber} />}
    </div>
  );
}

function normalizeRoute(route: string) {
  return route.replace(/^\//, "").split("?")[0];
}

function findPreviewPage(module: ModuleTemplate, previewPages: PageTemplate[], route: string, activeView: string, activeChild?: string) {
  const routeKey = normalizeRoute(route);
  return (
    previewPages.find((item) => item.key === activeChild) ??
    previewPages.find((item) => item.key === activeView) ??
    module.pages.find((item) => item.key === activeChild) ??
    module.pages.find((item) => item.key === activeView) ??
    module.pages.find((item) => item.routes?.some((itemRoute) => normalizeRoute(itemRoute) === routeKey)) ??
    previewPages[0] ??
    module.pages[0]
  );
}
