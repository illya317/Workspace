"use client";

import type { QcTemplateStage, QcTemplateTestItem } from "@/server/services/production/qc";
import QcLayoutPaper from "../QcLayoutPaper";
import QcMethodFieldTable from "../QcMethodFieldTable";
import { numerals, selectionTitle, type WorkbenchSelection } from "./types";

interface Props {
  selection: WorkbenchSelection | null;
  onClose: () => void;
}

function CheckBox() {
  return <span className="inline-block h-3.5 w-3.5 border border-slate-950 align-middle" />;
}

function PaperHeader({ selection }: { selection: WorkbenchSelection }) {
  const files = selection.stage.precheckFiles;
  const info = selection.stage.precheckInfo;
  return (
    <>
      <h3 className="mb-5 text-center text-lg font-semibold text-slate-950">
        {numerals[selection.stageIndex] ?? selection.stageIndex + 1}、{selection.template.productName}{selection.stage.label}
      </h3>
      <table className="mb-5 w-full border-collapse text-center text-sm text-slate-950">
        <tbody>
          <tr>
            <td className="w-[15%] border border-slate-950 px-3 py-2 font-semibold">检品名称</td>
            <td className="w-[35%] border border-slate-950 px-3 py-2">{String(info["检品名称"] ?? `${selection.template.productName}${selection.stage.label}`)}</td>
            <td className="w-[15%] border border-slate-950 px-3 py-2 font-semibold">包装情况</td>
            <td className="w-[35%] border border-slate-950 px-3 py-2">{String(info["包装情况"] ?? "")}</td>
          </tr>
          <tr>
            <td className="border border-slate-950 px-3 py-2 font-semibold">检验目的</td>
            <td className="border border-slate-950 px-3 py-2">{String(info["检验目的"] ?? "")}</td>
            <td className="border border-slate-950 px-3 py-2 font-semibold">检品数量</td>
            <td className="border border-slate-950 px-3 py-2">_____</td>
          </tr>
          <tr>
            <td className="border border-slate-950 px-3 py-2 font-semibold">请验部门</td>
            <td className="border border-slate-950 px-3 py-2">{String(info["请验部门"] ?? "")}</td>
            <td className="border border-slate-950 px-3 py-2 font-semibold">请验日期</td>
            <td className="border border-slate-950 px-3 py-2">年　月　日</td>
          </tr>
          <tr>
            <td className="border border-slate-950 px-3 py-2 font-semibold">检验依据</td>
            <td colSpan={3} className="border border-slate-950 px-3 py-2">
              {files.map((file) => `《${file.name}》（${file.code}）`).join("、")}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function PrecheckPreview({ stage }: { stage: QcTemplateStage }) {
  return (
    <>
      <div className="border border-slate-950 px-4 py-3 text-sm font-semibold text-slate-950">1 检验前确认</div>
      <table className="w-full border-collapse text-center text-sm text-slate-950">
        <tbody>
          <tr>
            <td className="w-[55%] border border-slate-950 px-3 py-2">文件名称</td>
            <td className="w-[25%] border border-slate-950 px-3 py-2">文件编码</td>
            <td className="w-[20%] border border-slate-950 px-3 py-2">是否在实验现场</td>
          </tr>
          {stage.precheckFiles.map((file) => (
            <tr key={`${file.name}-${file.code}`}>
              <td className="border border-slate-950 px-3 py-2">《{file.name}》</td>
              <td className="border border-slate-950 px-3 py-2">{file.code}</td>
              <td className="border border-slate-950 px-3 py-2"><CheckBox /> 是　<CheckBox /> 否</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stage.precheckItems.map((item, index) => (
        <div key={item.name} className="flex justify-between border-x border-b border-slate-950 px-4 py-2 text-sm font-semibold text-slate-950">
          <span>1.{index + 2} {item.name}</span>
          <span className="font-normal"><CheckBox /> 是　<CheckBox /> 否</span>
        </div>
      ))}
    </>
  );
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
      {test.layoutBlocks?.length ? <QcLayoutPaper blocks={test.layoutBlocks} compact /> : <QcMethodFieldTable test={test} compact />}
    </div>
  );
}

export default function TemplatePreviewModal({ selection, onClose }: Props) {
  if (!selection) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55">
      <div className="flex h-16 items-center justify-between bg-white px-5 text-sm font-semibold text-slate-950 shadow">
        <span>布局预览：{selectionTitle(selection)}</span>
        <button onClick={onClose} className="rounded-md bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200" aria-label="关闭预览">×</button>
      </div>
      <div className="h-[calc(100vh-4rem)] overflow-auto px-6 py-7">
        <div className="mx-auto min-h-[720px] max-w-5xl bg-white px-10 py-8 shadow-sm" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
          <PaperHeader selection={selection} />
          {selection.kind === "precheck" && <PrecheckPreview stage={selection.stage} />}
          {selection.kind === "experiment" && <ExperimentPreview tests={selection.stage.tests} />}
          {selection.kind === "test" && selection.test && <TestPreview test={selection.test} />}
        </div>
      </div>
    </div>
  );
}
