"use client";

import { useEffect, useState } from "react";
import { createPageBody, PageSurface } from "@workspace/core/ui";
import type { DocumentSurfacePageSpec } from "@workspace/core/ui";
import type { QcLayoutBlock } from "@workspace/production/server/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import TemplateInlineFeedback from "./TemplateInlineFeedback";
import { selectionTitle, type WorkbenchSelection } from "./types";
interface Props {
  selection: WorkbenchSelection | null;
  onClose: () => void;
  onSaved?: (keys: string[]) => void;
}
function topLevel(section?: string) {
  return section?.split(".")[0];
}
function fullSectionBlocks(blocks: QcLayoutBlock[], section: "1" | "2") {
  if (section === "1") {
    return blocks.filter(block => topLevel(block.sectionSuffix) !== "2");
  }
  return blocks.filter(block => topLevel(block.sectionSuffix) === "2");
}

function EmptyPaper({ content }: { content: string }) {
  return (
    <div className="qc-a4-page qc-paper-font qc-paper-page mx-auto box-border overflow-visible bg-white text-slate-950">
      <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">{content}</div>
    </div>
  );
}

function paperPage(key: string, content: DocumentSurfacePageSpec["content"]): DocumentSurfacePageSpec {
  return { key, size: "a4", content };
}

function previewPages(selection: WorkbenchSelection, precheckBlocks: QcLayoutBlock[], advancedMode: boolean, onSaved?: (keys: string[]) => void): DocumentSurfacePageSpec[] {
  if (selection.kind === "precheck") {
    return [paperPage("precheck", (
      <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
        <QcLayoutPaper blocks={precheckBlocks} advancedMode={advancedMode} />
      </TemplateInlineFeedback>
    ))];
  }

  if (selection.kind === "experiment") {
    const pages: DocumentSurfacePageSpec[] = [];
    if (selection.stage.experimentLayoutBlocks?.length) {
      pages.push(paperPage("experiment", (
        <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
          <QcLayoutPaper blocks={selection.stage.experimentLayoutBlocks} advancedMode={advancedMode} />
        </TemplateInlineFeedback>
      )));
    }
    for (const test of selection.stage.tests) {
      pages.push(paperPage(`test-${test.englishName || test.sequence}`, (
        <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
          {test.layoutBlocks?.length
            ? <QcLayoutPaper blocks={test.layoutBlocks} test={test} advancedMode={advancedMode} />
            : <EmptyPaper content={`${test.name} 当前没有可用的 JSON 布局预览。`} />}
        </TemplateInlineFeedback>
      )));
    }
    return pages;
  }

  if (selection.kind === "test" && selection.test) {
    const test = selection.test;
    return [paperPage("test", (
      <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
        {test.layoutBlocks?.length
          ? <QcLayoutPaper blocks={test.layoutBlocks} test={test} advancedMode={advancedMode} />
          : <EmptyPaper content="该项目当前没有可用的 JSON 布局预览。" />}
      </TemplateInlineFeedback>
    ))];
  }

  return [];
}
export default function TemplatePreviewModal({
  selection,
  onClose,
  onSaved
}: Props) {
  const [advancedMode, setAdvancedMode] = useState(false);
  useEffect(() => {
    setAdvancedMode(false);
  }, [selection]);
  if (!selection) return null;
  const fullBlocks = selection.stage.precheckLayoutBlocks ?? [];
  const precheckBlocks = fullSectionBlocks(fullBlocks, "1");
  const pages = previewPages(selection, precheckBlocks, advancedMode, onSaved);
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([], { modals: [{
      key: "template-preview-modal",
      open: true,
      title: `布局预览：${selectionTitle(selection)}`,
      onClose,
      size: "xl",
      sections: [
        {
          key: "template-preview-body",
          framed: false,
          header: {
            actions: [{
              key: "toggle-advanced-mode",
              label: advancedMode ? "开发模式" : "预览模式",
              variant: advancedMode ? "danger" : "primary",
              onClick: () => setAdvancedMode(current => !current),
            }],
          },
          body: { kind: "document", document: {
            kind: "pages",
            pages: { items: pages },
          } },
        },
      ],
    }] })}
  />;
}
