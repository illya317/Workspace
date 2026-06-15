"use client";

import type { QcLayoutBlock, QcTemplateTestItem } from "@/server/services/production/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import QcMethodFieldTable from "../QcMethodFieldTable";
import { numerals, selectionTitle, type WorkbenchSelection } from "./types";

interface Props {
  selection: WorkbenchSelection | null;
  onClose: () => void;
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

function TestPreview({ test }: { test: QcTemplateTestItem }) {
  return (
    <div className="space-y-4 text-sm text-slate-950">
      <table className="w-full border-collapse">
        <tbody>
          <tr><td className="w-32 border border-slate-950 px-3 py-2 text-center font-semibold">标准规定</td><td className="border border-slate-950 px-3 py-2">{test.standardText || "未配置"}</td></tr>
          <tr><td className="border border-slate-950 px-3 py-2 text-center font-semibold">结论</td><td className="border border-slate-950 px-3 py-2">{test.conclusionName || test.name}{test.hasNumericConclusion ? "（含数值）" : ""}</td></tr>
          <tr><td className="border border-slate-950 px-3 py-2 text-center font-semibold">组件映射</td><td className="border border-slate-950 px-3 py-2">{test.layout?.templateId || "未映射"}</td></tr>
        </tbody>
      </table>
      {test.layoutBlocks?.length ? <QcLayoutPaper blocks={test.layoutBlocks} compact test={test} /> : <QcMethodFieldTable test={test} compact />}
    </div>
  );
}

export default function TemplatePreviewModal({ selection, onClose }: Props) {
  if (!selection) return null;
  const fullBlocks = selection.stage.precheckLayoutBlocks ?? [];
  const precheckBlocks = fullSectionBlocks(fullBlocks, "1");
  const experimentBlocks = fullSectionBlocks(fullBlocks, "2");
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55">
      <div className="h-full overflow-auto px-3 py-7 md:px-6">
        <div className="relative mx-auto min-h-[720px] max-w-[min(230mm,calc(100vw-3rem))] bg-white px-8 py-8 shadow-sm xl:px-10" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
          <div className="mb-6 flex items-start justify-between gap-4 pr-12 text-sm font-semibold text-slate-950">
            <span>布局预览：{selectionTitle(selection)}</span>
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-md bg-slate-100 px-3 py-2 font-sans text-slate-700 hover:bg-slate-200"
              aria-label="关闭预览"
            >
              ×
            </button>
          </div>
          {selection.kind === "precheck" && (
            <>
              <h3 className="mb-5 text-center text-lg font-semibold text-slate-950">
                {numerals[selection.stageIndex] ?? selection.stageIndex + 1}、{selection.template.productName}{selection.stage.label}
              </h3>
              <QcLayoutPaper blocks={precheckBlocks} compact />
            </>
          )}
          {selection.kind === "experiment" && <QcLayoutPaper blocks={experimentBlocks} compact />}
          {selection.kind === "test" && selection.test && <TestPreview test={selection.test} />}
        </div>
      </div>
    </div>
  );
}
