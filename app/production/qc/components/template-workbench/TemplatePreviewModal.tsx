"use client";

import { useEffect, useState } from "react";
import type { QcLayoutBlock, QcTemplateTestItem } from "@/server/services/production/qc";
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
    return blocks.filter((block) => topLevel(block.sectionSuffix) !== "2");
  }
  return blocks.filter((block) => topLevel(block.sectionSuffix) === "2");
}

function TestPreview({ test, advancedMode }: { test: QcTemplateTestItem; advancedMode: boolean }) {
  if (!test.layoutBlocks?.length) {
    return (
      <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">
        该项目当前没有可用的 JSON 布局预览。
      </div>
    );
  }

  return (
    <QcLayoutPaper blocks={test.layoutBlocks} compact test={test} advancedMode={advancedMode} />
  );
}

function ExperimentPreview({
  stageBlocks,
  tests,
  advancedMode,
}: {
  stageBlocks?: QcLayoutBlock[];
  tests: QcTemplateTestItem[];
  advancedMode: boolean;
}) {
  return (
    <div className="space-y-5 text-slate-950">
      {stageBlocks?.length ? <QcLayoutPaper blocks={stageBlocks} compact advancedMode={advancedMode} /> : null}
      {tests.map((test) => (
        <div key={test.englishName || test.sequence}>
          {test.layoutBlocks?.length ? (
            <QcLayoutPaper blocks={test.layoutBlocks} compact test={test} advancedMode={advancedMode} />
          ) : (
            <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">
              {test.name} 当前没有可用的 JSON 布局预览。
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TemplatePreviewModal({ selection, onClose, onSaved }: Props) {
  const [advancedMode, setAdvancedMode] = useState(true);
  useEffect(() => {
    setAdvancedMode(true);
  }, [selection]);
  if (!selection) return null;
  const fullBlocks = selection.stage.precheckLayoutBlocks ?? [];
  const precheckBlocks = fullSectionBlocks(fullBlocks, "1");
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55">
      <div className="h-full overflow-auto px-3 py-7 md:px-6">
        <div className="relative mx-auto min-h-[720px] max-w-[min(230mm,calc(100vw-3rem))] bg-white px-8 py-8 shadow-sm xl:px-10" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
          <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4 pr-12 text-sm font-semibold text-slate-950">
            <span className="self-center">布局预览：{selectionTitle(selection)}</span>
            <button
              onClick={() => setAdvancedMode((current) => !current)}
              className={`justify-self-center rounded-md border px-4 py-2 text-sm font-semibold ${advancedMode ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
            >
              {advancedMode ? "预览模式" : "开发模式"}
            </button>
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-md bg-slate-100 px-3 py-2 font-sans text-slate-700 hover:bg-slate-200"
              aria-label="关闭预览"
            >
              ×
            </button>
          </div>
          {selection.kind === "precheck" && (
            <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
              <h3 className="mb-5 text-center text-lg font-semibold text-slate-950">
                {numerals[selection.stageIndex] ?? selection.stageIndex + 1}、{selection.template.productName}{selection.stage.label}
              </h3>
              <QcLayoutPaper blocks={precheckBlocks} compact advancedMode={advancedMode} />
            </TemplateInlineFeedback>
          )}
          {selection.kind === "experiment" && (
            <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
              <ExperimentPreview
                stageBlocks={selection.stage.experimentLayoutBlocks}
                tests={selection.stage.tests}
                advancedMode={advancedMode}
              />
            </TemplateInlineFeedback>
          )}
          {selection.kind === "test" && selection.test && (
            <TemplateInlineFeedback selection={selection} onSaved={onSaved}>
              <TestPreview test={selection.test} advancedMode={advancedMode} />
            </TemplateInlineFeedback>
          )}
        </div>
      </div>
    </div>
  );
}
