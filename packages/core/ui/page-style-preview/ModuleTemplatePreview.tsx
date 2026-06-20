"use client";

import { useMemo, useState } from "react";
import PreviewToolbar from "./PreviewToolbar";
import { getPreviewPages, type ModuleTemplate } from "./template-data";
import TemplateFooter from "./TemplateFooter";
import TemplateHeader from "./TemplateHeader";
import { TemplateBody } from "./template-bodies";

export default function ModuleTemplatePreview({
  module,
  activeChild,
}: {
  module: ModuleTemplate;
  activeChild: string;
}) {
  const previewPages = useMemo(() => getPreviewPages(module), [module]);
  const page = useMemo(
    () => previewPages.find((item) => item.key === activeChild) ?? previewPages[0] ?? module.pages[0],
    [activeChild, module.pages, previewPages],
  );
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
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
