"use client";

import { useEffect, useState } from "react";
import { PageSurface, createActionsBlock } from "@workspace/core/ui";
import type { QcLayoutBlock, QcTemplateTestItem } from "@workspace/production/server/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import TemplateInlineFeedback from "./TemplateInlineFeedback";
import { numerals, selectionTitle, type WorkbenchSelection } from "./types";
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
function TestPreview({
  test,
  advancedMode
}: {
  test: QcTemplateTestItem;
  advancedMode: boolean;
}) {
  if (!test.layoutBlocks?.length) {
    return <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">
        该项目当前没有可用的 JSON 布局预览。
      </div>;
  }
  return <QcLayoutPaper blocks={test.layoutBlocks} compact test={test} advancedMode={advancedMode} />;
}
function ExperimentPreview({
  stageBlocks,
  tests,
  advancedMode
}: {
  stageBlocks?: QcLayoutBlock[];
  tests: QcTemplateTestItem[];
  advancedMode: boolean;
}) {
  return <div className="space-y-5 text-slate-950">
      {stageBlocks?.length ? <QcLayoutPaper blocks={stageBlocks} compact advancedMode={advancedMode} /> : null}
      {tests.map(test => <div key={test.englishName || test.sequence}>
          {test.layoutBlocks?.length ? <QcLayoutPaper blocks={test.layoutBlocks} compact test={test} advancedMode={advancedMode} /> : <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">
              {test.name} 当前没有可用的 JSON 布局预览。
            </div>}
        </div>)}
    </div>;
}
function PreviewModeToggle({
  advancedMode,
  onToggle,
}: {
  advancedMode: boolean;
  onToggle: () => void;
}) {
  return (
    <PageSurface
      kind="detail"
      embedded
      className="justify-self-center"
      blocks={[
        createActionsBlock("template-preview-mode-toggle", [{
          key: "toggle-advanced-mode",
          label: advancedMode ? "开发模式" : "预览模式",
          variant: advancedMode ? "danger" : "primary",
          onClick: onToggle,
        }]),
      ]}
    />
  );
}
export default function TemplatePreviewModal({
  selection,
  onClose,
  onSaved
}: Props) {
  const [advancedMode, setAdvancedMode] = useState(true);
  useEffect(() => {
    setAdvancedMode(true);
  }, [selection]);
  if (!selection) return null;
  const fullBlocks = selection.stage.precheckLayoutBlocks ?? [];
  const precheckBlocks = fullSectionBlocks(fullBlocks, "1");
  return <PageSurface
    kind="detail"
    embedded
    blocks={[{
      kind: "modal",
      key: "template-preview-modal",
      open: true,
      title: `布局预览：${selectionTitle(selection)}`,
      onClose,
      maxWidth: "max-w-[min(230mm,calc(100vw-3rem))]",
      blocks: [{
        kind: "document",
        key: "template-preview-body",
        surface: {
          kind: "pages",
          pages: [{
            key: "preview",
            size: "fluid",
            className: "min-h-[720px] px-2 py-2 xl:px-4",
            style: { fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" },
            content: (
              <>
                <div className="mb-6 grid grid-cols-[1fr_auto] items-start gap-4 text-sm font-semibold text-slate-950">
                  <span />
                  <PreviewModeToggle advancedMode={advancedMode} onToggle={() => setAdvancedMode(current => !current)} />
                </div>
                {selection.kind === "precheck" && <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
                    <h3 className="mb-5 text-center text-lg font-semibold text-slate-950">
                      {numerals[selection.stageIndex] ?? selection.stageIndex + 1}、{selection.template.productName}{selection.stage.label}
                    </h3>
                    <QcLayoutPaper blocks={precheckBlocks} compact advancedMode={advancedMode} />
                  </TemplateInlineFeedback>}
                {selection.kind === "experiment" && <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
                    <ExperimentPreview stageBlocks={selection.stage.experimentLayoutBlocks} tests={selection.stage.tests} advancedMode={advancedMode} />
                  </TemplateInlineFeedback>}
                {selection.kind === "test" && selection.test && <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
                    <TestPreview test={selection.test} advancedMode={advancedMode} />
                  </TemplateInlineFeedback>}
              </>
            ),
          }],
        },
      }],
    }]}
  />;
}
