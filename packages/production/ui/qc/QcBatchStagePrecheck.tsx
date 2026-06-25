import Link from "next/link";
import { TableScrollFrame, Toolbar, getToolbarActionClassName } from "@workspace/core/ui";
import type { QcBatchSummary, QcLayoutBlock, QcTemplateDetail, QcTemplateStage } from "@workspace/production/server/qc";
import { buildQcBatchWorkflow } from "@workspace/production/qc/workflow";
import QcLayoutPaper from "./QcLayoutPaper";
interface Props {
  batch: QcBatchSummary;
  productName: string;
  detail: QcTemplateDetail;
  stage: QcTemplateStage;
  stageIndex: number;
}
const numerals = ["一", "二", "三", "四", "五", "六"];
function withBatchNumber(blocks: QcLayoutBlock[], batchNumber: string) {
  return blocks.map(block => ({
    ...block,
    rows: block.rows?.map(row => row.map(cell => ({
      ...cell,
      parts: cell.parts.map(part => part.fieldKey === "batch_number" ? {
        ...part,
        defaultValue: batchNumber
      } : part)
    })))
  }));
}
export default function QcBatchStagePrecheck({
  batch,
  productName,
  detail,
  stage,
  stageIndex
}: Props) {
  const blocks = withBatchNumber(stage.precheckLayoutBlocks ?? [], batch.batchNumber);
  const referenceValues = {
    "__qc_ref/batch_number": batch.batchNumber
  };
  const workflow = buildQcBatchWorkflow(detail, batch);
  const stageStatus = workflow.stages[stageIndex];
  const locked = !stageStatus?.unlocked;
  return <TableScrollFrame className="pb-8">
      <div className="mx-auto max-w-[210mm]">
        <nav className="mb-5 flex flex-wrap gap-2 text-xs">
          <Link href={`/production/qc-batches/${batch.id}`} className="rounded bg-blue-100 px-3 py-2 font-medium text-blue-800">
            返回批次主页
          </Link>
          <Link href={`/production/qc-batches/${batch.id}/${stage.key}`} className="rounded bg-slate-200 px-3 py-2 font-semibold text-slate-900">
            检验前确认
          </Link>
          {stage.tests.map(test => {
          const testStatus = stageStatus?.tests.find(item => item.testName === test.englishName);
          return locked ? <span key={test.englishName} className="rounded bg-slate-50 px-3 py-2 text-slate-400">
                {test.sequence} {test.name}
              </span> : <Link key={test.englishName} href={`/production/qc-batches/${batch.id}/${stage.key}/${test.englishName}`} className="rounded bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200">
                {test.sequence} {test.name}{testStatus?.automatic ? " · 自动通过" : ""}
              </Link>;
        })}
        </nav>

        <Toolbar items={[{
        kind: "custom",
        key: "stage-title",
        content: `${numerals[stageIndex] ?? stageIndex + 1}、${productName}${stage.label}`
      }]} className="mb-5" />
      </div>

      {locked ? <div className="mx-auto max-w-[210mm] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          前一阶段尚未全部复核完成，当前阶段暂不可操作。
        </div> : <div className="min-w-[210mm]">
          <QcLayoutPaper blocks={blocks} referenceValues={referenceValues} />
        </div>}
      <div className="mx-auto mt-8 max-w-[210mm] text-center">
        <button type="button" disabled={locked} className={[getToolbarActionClassName("primary"), "px-8"].filter(Boolean).join(" ")}>保存</button>
      </div>
    </TableScrollFrame>;
}
