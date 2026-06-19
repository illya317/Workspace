import Link from "next/link";
import type { QcBatchSummary, QcLayoutBlock, QcTemplateStage } from "@workspace/production/server/qc";
import QcLayoutPaper from "./QcLayoutPaper";

interface Props {
  batch: QcBatchSummary;
  productName: string;
  stage: QcTemplateStage;
  stageIndex: number;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

function withBatchNumber(blocks: QcLayoutBlock[], batchNumber: string) {
  return blocks.map((block) => ({
    ...block,
    rows: block.rows?.map((row) => row.map((cell) => ({
      ...cell,
      parts: cell.parts.map((part) => (
        part.fieldKey === "batch_number" ? { ...part, defaultValue: batchNumber } : part
      )),
    }))),
  }));
}

export default function QcBatchStagePrecheck({ batch, productName, stage, stageIndex }: Props) {
  const blocks = withBatchNumber(stage.precheckLayoutBlocks ?? [], batch.batchNumber);

  return (
    <section className="bg-white px-4 py-7 shadow-sm">
      <div className="mx-auto max-w-[min(230mm,calc(100vw-2rem))]" style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"仿宋\", serif" }}>
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

        <QcLayoutPaper blocks={blocks} />
        <div className="mt-8 text-center">
          <button className="rounded-md bg-blue-600 px-8 py-2 text-sm font-semibold text-white">保存</button>
        </div>
      </div>
    </section>
  );
}
