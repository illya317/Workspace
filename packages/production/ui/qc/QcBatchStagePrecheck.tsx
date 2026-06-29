import { createBlockSurfaceSection, createHeadingSection, createPageBody, PageSurface } from "@workspace/core/ui";
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
  const precheckSteps = [
    {
      key: "batch",
      label: "返回批次主页",
      href: `/production/qc-batches/${batch.id}`,
      tone: "primary" as const,
    },
    {
      key: "precheck",
      label: "检验前确认",
      href: `/production/qc-batches/${batch.id}/${stage.key}`,
    },
    ...stage.tests.map(test => {
      const testStatus = stageStatus?.tests.find(item => item.testName === test.englishName);
      return {
        key: test.englishName,
        label: `${test.sequence} ${test.name}${testStatus?.automatic ? " · 自动通过" : ""}`,
        href: locked ? undefined : `/production/qc-batches/${batch.id}/${stage.key}/${test.englishName}`,
        disabled: locked,
        tone: locked ? "muted" as const : "neutral" as const,
      };
    }),
  ];
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([
      {
        kind: "navigation",
        key: "precheck-navigation",
        surface: {
          kind: "steps",
          active: "precheck",
          ariaLabel: "质检阶段导航",

          steps: precheckSteps,
        },
      },
      createHeadingSection("precheck-heading", {

        title: `${numerals[stageIndex] ?? stageIndex + 1}、${productName}${stage.label}`,
      }),
      locked ? createBlockSurfaceSection("precheck-locked", {
        kind: "message",
        tone: "warning",

        content: "前一阶段尚未全部复核完成，当前阶段暂不可操作。"
      }) : {
        kind: "document",
        key: "precheck-paper",
        surface: {
          kind: "pages",
          pages: [{
            key: "paper",
            size: "a4",
            content: <QcLayoutPaper blocks={blocks} referenceValues={referenceValues} />,
          }],
        },
      },
      {
        kind: "form",
        key: "precheck-actions",
        surface: {
          kind: "inline",

          actions: [
            { key: "save", label: "保存", variant: "primary", disabled: locked,  },
          ],
        },
      },
    ])}
  />;
}
