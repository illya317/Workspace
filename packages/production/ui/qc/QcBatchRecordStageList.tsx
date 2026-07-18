import { BodySurface, type BodySurfaceProps } from "@workspace/core/ui";
import { createStageFlowBody, type StageFlowStageSpec, type StageFlowStateSpec } from "@workspace/platform/ui";
import type { QcBatchSummary } from "@workspace/production/types";
import type { QcEditorRuntimeTemplate } from "@workspace/production/types";
import {
  buildQcBatchWorkflow,
  qcBatchReviewWorkflowStatus,
  qcStageReviewWorkflowStatus,
  qcTestReviewWorkflowStatus,
  type QcStageWorkflowStatus,
  type QcTestWorkflowStatus,
} from "@workspace/production/qc/workflow";
import { qcBatchStagePath, qcBatchTestPath } from "./qc-routes";

interface QcBatchRecordStageListProps {
  batch: QcBatchSummary;
  runtimeTemplate: QcEditorRuntimeTemplate;
  embedded?: boolean;
}

const numerals = ["一", "二", "三", "四", "五", "六"];

/** @ui-structural-declaration QC maps workflow data into the shared stage-flow structure. */
export function createQcBatchRecordStageBody(batch: QcBatchSummary, runtimeTemplate: QcEditorRuntimeTemplate, embedded = true): BodySurfaceProps {
  const workflow = buildQcBatchWorkflow(runtimeTemplate, batch);
  const completedStages = workflow.stages.filter((stage) => stage.complete).length;
  const completedTests = workflow.tests.filter((test) => test.complete).length;
  const pendingReview = workflow.tests.filter((test) => test.inspected && !test.reviewed).length
    + workflow.stages.filter((stage) => stage.precheckInspected && !stage.precheckReviewed).length;

  return createStageFlowBody({
    eyebrow: "批次检验记录",
    title: batch.productName,
    status: qcBatchReviewWorkflowStatus(workflow.statusLabels),
    flowType: "review",
    embedded,
    summary: [
      { key: "batch", label: "批号", value: batch.batchNumber },
      { key: "id", label: "批次ID", value: String(batch.id) },
      { key: "product", label: "产品", value: batch.productName },
      { key: "progress", label: "进度", value: `${completedTests}/${workflow.tests.length} 项完成` },
    ],
    highlights: [
      { key: "stages", label: "阶段完成", value: `${completedStages}/${workflow.stages.length}` },
      { key: "review", label: "待复核", value: pendingReview, tone: "warning" },
    ],
    stages: runtimeTemplate.stages.map((stage, index) => qcStageSpec(batch.id, stage.key, stage.label, stage.tests.length, index, workflow.stages[index])),
  });
}

export default function QcBatchRecordStageList({ batch, runtimeTemplate, embedded = false }: QcBatchRecordStageListProps) {
  return <BodySurface {...createQcBatchRecordStageBody(batch, runtimeTemplate, embedded)} />;
}

function qcStageSpec(batchId: number, stageKey: string, label: string, testCount: number, index: number, status?: QcStageWorkflowStatus): StageFlowStageSpec {
  const locked = !status?.unlocked;
  return {
    key: stageKey,
    ordinal: numerals[index] ?? index + 1,
    title: label,
    description: `${testCount} 项检测`,
    href: locked ? undefined : qcBatchStagePath(batchId, stageKey),
    state: qcStageState(status, locked),
    complete: !!status?.complete,
    notices: status?.tests.some((test) => test.waitingSourceReview)
      ? [{ key: "source-review", label: "等待来源复核" }]
      : undefined,
    items: status?.tests.map((test) => ({
      key: test.testName,
      label: `${test.sequence} ${test.name}`,
      href: locked ? undefined : qcBatchTestPath(batchId, stageKey, test.testName),
      state: qcTestState(test, locked),
    })),
  };
}

function qcStageState(status: QcStageWorkflowStatus | undefined, locked: boolean): StageFlowStateSpec {
  if (locked) return { kind: "locked", label: "前一阶段复核完成后解锁" };
  const workflowStatus = qcStageReviewWorkflowStatus(status, locked);
  if (workflowStatus) return { kind: "workflow", status: workflowStatus };
  return { kind: "pending", label: "待检验前确认" };
}

function qcTestState(test: QcTestWorkflowStatus, locked: boolean): StageFlowStateSpec {
  if (locked) return { kind: "locked", label: "未解锁" };
  const workflowStatus = qcTestReviewWorkflowStatus(test, locked);
  return workflowStatus ? { kind: "workflow", status: workflowStatus } : { kind: "neutral" };
}
