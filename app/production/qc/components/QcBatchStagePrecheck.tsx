import Link from "next/link";
import type { QcBatchSummary, QcTemplateStage } from "@/server/services/production/qc";
import { QcPaperChoiceInput, QcPaperDateInput, QcPaperLineInput } from "./QcPaperInputs";

interface Props {
  batch: QcBatchSummary;
  productName: string;
  stage: QcTemplateStage;
  stageIndex: number;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

export default function QcBatchStagePrecheck({ batch, productName, stage, stageIndex }: Props) {
  const files = stage.precheckFiles ?? [];
  const info = stage.precheckInfo ?? {};
  const confirmItems = stage.precheckItems ?? [];

  return (
    <section className="bg-white px-4 py-7 shadow-sm">
      <div className="mx-auto max-w-5xl" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
        <nav className="mb-5 flex flex-wrap gap-2 text-xs">
          <Link href={`/production/qc/batches/${batch.id}`} className="rounded bg-blue-100 px-3 py-2 font-medium text-blue-800">
            返回批次主页
          </Link>
          <Link href={`/production/qc/batches/${batch.id}/${stage.key}`} className="rounded bg-slate-200 px-3 py-2 font-semibold text-slate-900">
            检验前确认
          </Link>
          {stage.tests.map((test) => (
            <Link
              key={test.englishName}
              href={`/production/qc/batches/${batch.id}/${stage.key}/${test.englishName}`}
              className="rounded bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
            >
              {test.sequence} {test.name}
            </Link>
          ))}
        </nav>

        <h1 className="mb-5 text-center text-base font-semibold text-slate-950">
          {numerals[stageIndex] ?? stageIndex + 1}、{productName}{stage.label}
        </h1>

        <table className="mb-4 w-full border-collapse text-center text-sm text-slate-950">
          <tbody>
            <tr>
              <td className="w-[15%] border border-slate-950 px-3 py-2">批号</td>
              <td className="w-[35%] border border-slate-950 px-3 py-2">{batch.batchNumber}</td>
              <td className="w-[15%] border border-slate-950 px-3 py-2">包装情况</td>
              <td className="w-[35%] border border-slate-950 px-3 py-2">{String(info["包装情况"] ?? "")}</td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2">检品名称</td>
              <td className="border border-slate-950 px-3 py-2">{String(info["检品名称"] ?? `${productName}${stage.label}`)}</td>
              <td className="border border-slate-950 px-3 py-2">检品数量</td>
              <td className="border border-slate-950 px-3 py-2"><QcPaperLineInput part={{ type: "line", fieldKey: "pre_check/quantity", width: "4em" }} /></td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2">检验目的</td>
              <td className="border border-slate-950 px-3 py-2">{String(info["检验目的"] ?? "")}</td>
              <td className="border border-slate-950 px-3 py-2">检品数量</td>
              <td className="border border-slate-950 px-3 py-2"><QcPaperLineInput part={{ type: "line", fieldKey: "pre_check/quantity_2", width: "4em" }} /></td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2">请验部门</td>
              <td className="border border-slate-950 px-3 py-2">{String(info["请验部门"] ?? "")}</td>
              <td className="border border-slate-950 px-3 py-2">请验日期</td>
              <td className="border border-slate-950 px-3 py-2"><QcPaperDateInput part={{ type: "date", fieldKey: "pre_check/request_date" }} /></td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2">检验日期</td>
              <td className="border border-slate-950 px-3 py-2"><QcPaperDateInput part={{ type: "date", fieldKey: "pre_check/inspect_date" }} /></td>
              <td className="border border-slate-950 px-3 py-2">报告日期</td>
              <td className="border border-slate-950 px-3 py-2"><QcPaperDateInput part={{ type: "date", fieldKey: "pre_check/report_date" }} /></td>
            </tr>
            <tr>
              <td className="border border-slate-950 px-3 py-2">检验依据</td>
              <td colSpan={3} className="border border-slate-950 px-3 py-2">
                {files.map((file) => `《${file.name}》（${file.code}）`).join("、")}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mb-3 text-sm font-semibold text-slate-950">1 检验前确认</div>
        <div className="mb-3 text-sm font-semibold text-slate-950">1.1 文件</div>
        <table className="mb-3 w-full border-collapse text-center text-sm text-slate-950">
          <tbody>
            <tr>
              <td className="w-[55%] border border-slate-950 px-3 py-2">文件名称</td>
              <td className="w-[25%] border border-slate-950 px-3 py-2">文件编码</td>
              <td className="w-[20%] border border-slate-950 px-3 py-2">是否在实验现场</td>
            </tr>
            {files.map((file, index) => (
              <tr key={`${file.name}-${file.code}`}>
                <td className="border border-slate-950 px-3 py-2">《{file.name}》</td>
                <td className="border border-slate-950 px-3 py-2">{file.code}</td>
                <td className="border border-slate-950 px-3 py-2">
                  <QcPaperChoiceInput fieldKey={`pre_check/file_${index + 1}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {confirmItems.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between border-b border-slate-950 py-2 text-sm font-semibold text-slate-950">
            <span>1.{index + 2} {item.name}</span>
            <span className="font-normal">
              <QcPaperChoiceInput fieldKey={`pre_check/confirm_${index + 1}`} />
            </span>
          </div>
        ))}

        <div className="flex items-center justify-between border-b border-slate-950 py-2 text-sm font-semibold text-slate-950">
          <span>1.{confirmItems.length + 2} 实验环境</span>
          <span className="font-normal">
            <QcPaperChoiceInput fieldKey="pre_check/env" options={["符合要求", "不符合要求"]} />
          </span>
        </div>

        <div className="mt-4 text-sm font-semibold text-slate-950">2 实验项目</div>
        <div className="mt-8 text-center">
          <button className="rounded-md bg-blue-600 px-8 py-2 text-sm font-semibold text-white">保存</button>
        </div>
      </div>
    </section>
  );
}
