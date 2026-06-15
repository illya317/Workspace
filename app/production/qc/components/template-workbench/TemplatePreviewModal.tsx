"use client";

import type { QcTemplateTestItem } from "@/server/services/production/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import QcMethodFieldTable from "../QcMethodFieldTable";
import { numerals, selectionTitle, type WorkbenchSelection } from "./types";

interface Props {
  selection: WorkbenchSelection | null;
  onClose: () => void;
}

function ExperimentPreview({ tests }: { tests: QcTemplateTestItem[] }) {
  return (
    <table className="w-full border-collapse text-sm text-slate-950">
      <tbody>
        <tr>
          <td className="w-24 border border-slate-950 px-3 py-2 text-center font-semibold">序号</td>
          <td className="border border-slate-950 px-3 py-2 text-center font-semibold">项目</td>
          <td className="border border-slate-950 px-3 py-2 text-center font-semibold">方法</td>
          <td className="border border-slate-950 px-3 py-2 text-center font-semibold">组件</td>
        </tr>
        {tests.map((test) => (
          <tr key={test.englishName}>
            <td className="border border-slate-950 px-3 py-2 text-center">{test.sequence}</td>
            <td className="border border-slate-950 px-3 py-2">{test.name}</td>
            <td className="border border-slate-950 px-3 py-2">{test.methodName || "-"}</td>
            <td className="border border-slate-950 px-3 py-2">{test.layout?.templateId || "未映射"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
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
  const precheckBlocks = selection.stage.precheckLayoutBlocks ?? [];
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55">
      <div className="h-full overflow-auto px-6 py-7">
        <div className="relative mx-auto min-h-[720px] max-w-5xl bg-white px-10 py-8 shadow-sm" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
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
          {selection.kind === "experiment" && <ExperimentPreview tests={selection.stage.tests} />}
          {selection.kind === "test" && selection.test && <TestPreview test={selection.test} />}
        </div>
      </div>
    </div>
  );
}
