"use client";

import { useMemo, useState } from "react";
import AccordionTabBar from "../AccordionTabBar";
import { PanelCard } from "../BaseCards";
import PreviewToolbar from "./PreviewToolbar";
import type { ModuleTemplate } from "./template-data";
import TemplateFooter from "./TemplateFooter";
import { TemplateBody } from "./template-bodies";

export default function ModuleTemplatePreview({
  module,
  activeChild,
}: {
  module: ModuleTemplate;
  activeChild: string;
}) {
  const page = useMemo(
    () => module.pages.find((item) => item.key === activeChild) ?? module.pages[0],
    [activeChild, module.pages],
  );
  const [innerTab, setInnerTab] = useState(module.nav[0] ?? "总览");
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
      <PanelCard bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950">{module.label}</h2>
            <p className="mt-1 text-sm text-slate-500">{page.title}</p>
          </div>
        </div>
      </PanelCard>

      <AccordionTabBar
        tabs={[{ key: "main", label: module.label, children: module.nav.map((label) => ({ key: label, label })) }]}
        activeTab="main"
        activeChild={innerTab}
        onTabChange={() => {}}
        onChildChange={setInnerTab}
      />

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
