import type { QcBatchSummary, QcTemplateDetail, QcTemplateStage, QcTemplateTestItem } from "../types";

export type QcBatchStatusLabel = "异常" | "已验收" | "检验中" | "待复核";

export interface QcTestSignatureKeys {
  inspector: string;
  reviewer: string;
}

export interface QcTestWorkflowStatus {
  stageKey: string;
  stageIndex: number;
  testName: string;
  sequence: string;
  name: string;
  keys: QcTestSignatureKeys;
  sourceKeys?: QcTestSignatureKeys;
  automatic: boolean;
  inspected: boolean;
  reviewed: boolean;
  complete: boolean;
  rejected: boolean;
  waitingSourceReview: boolean;
  inspectorName: string;
  reviewerName: string;
  canSaveInspection: boolean;
  canApproveReview: boolean;
}

export interface QcStageWorkflowStatus {
  key: string;
  label: string;
  index: number;
  unlocked: boolean;
  complete: boolean;
  tests: QcTestWorkflowStatus[];
}

export interface QcBatchWorkflow {
  stages: QcStageWorkflowStatus[];
  tests: QcTestWorkflowStatus[];
  inspectorNames: string[];
  reviewerNames: string[];
  statusLabels: QcBatchStatusLabel[];
}

export function qcSignatureKeys(stageKey: string, testName: string): QcTestSignatureKeys {
  return {
    inspector: `${stageKey}/${testName}/signature/inspector`,
    reviewer: `${stageKey}/${testName}/signature/reviewer`,
  };
}

export function qcReusedPackagingSource(test: QcTemplateTestItem) {
  if (test.copyFromPackaging && test.copiedFrom?.stage === "packaging" && test.copiedFrom.key) {
    return { stageKey: "packaging", testName: test.copiedFrom.key };
  }
  const reusedFrom = test.layout?.reusedFrom || "";
  const layoutKey = test.layout?.key || "";
  const sourceMatch = reusedFrom.match(/^products\/([^/]+)\/packaging\/([^/]+)$/);
  const currentMatch = layoutKey.match(/^products\/([^/]+)\/finished\/([^/]+)$/);
  if (!sourceMatch || !currentMatch || test.layout?.status !== "reused_packaging") return undefined;
  return sourceMatch[1] === currentMatch[1] && sourceMatch[2] === currentMatch[2]
    ? { stageKey: "packaging", testName: sourceMatch[2] }
    : undefined;
}

export function uniqueQcNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function fieldValue(batch: QcBatchSummary, key?: string) {
  return key ? String(batch.fields[key] || "").trim() : "";
}

function testHasRejectedResult(batch: QcBatchSummary, stageKey: string, test: QcTemplateTestItem) {
  const prefix = `${stageKey}/${test.englishName}/`;
  const explicitKeys = new Set([test.conclusionFieldKey].filter(Boolean));
  return Object.entries(batch.fields).some(([key, value]) => (
    (key.startsWith(prefix) || explicitKeys.has(key))
    && !key.includes("/signature/")
    && String(value).includes("不符合")
  ));
}

function findSourceKeys(detail: QcTemplateDetail, test: QcTemplateTestItem) {
  const source = qcReusedPackagingSource(test);
  if (!source) return undefined;
  const sourceStage = detail.stages.find((stage) => stage.key === source.stageKey);
  const sourceTest = sourceStage?.tests.find((item) => item.englishName === source.testName);
  return sourceStage && sourceTest ? qcSignatureKeys(sourceStage.key, sourceTest.englishName) : undefined;
}

function testStatus(batch: QcBatchSummary, detail: QcTemplateDetail, stage: QcTemplateStage, stageIndex: number, test: QcTemplateTestItem, actorName?: string): QcTestWorkflowStatus {
  const keys = qcSignatureKeys(stage.key, test.englishName);
  const sourceKeys = findSourceKeys(detail, test);
  const automatic = !!sourceKeys;
  const ownInspector = fieldValue(batch, keys.inspector);
  const ownReviewer = fieldValue(batch, keys.reviewer);
  const sourceInspector = fieldValue(batch, sourceKeys?.inspector);
  const sourceReviewer = fieldValue(batch, sourceKeys?.reviewer);
  const inspectorName = automatic ? sourceInspector : ownInspector;
  const reviewerName = automatic ? sourceReviewer : ownReviewer;
  const inspected = automatic ? !!sourceInspector : !!ownInspector;
  const reviewed = automatic ? !!sourceReviewer : !!ownReviewer;
  const rejected = automatic
    ? !!sourceReviewer && detail.stages.some((sourceStage) => sourceStage.tests.some((sourceTest) => (
      sourceKeys?.inspector === qcSignatureKeys(sourceStage.key, sourceTest.englishName).inspector
      && testHasRejectedResult(batch, sourceStage.key, sourceTest)
    )))
    : !!ownReviewer && testHasRejectedResult(batch, stage.key, test);
  return {
    stageKey: stage.key,
    stageIndex,
    testName: test.englishName,
    sequence: test.sequence,
    name: test.name,
    keys,
    sourceKeys,
    automatic,
    inspected,
    reviewed,
    complete: reviewed,
    rejected,
    waitingSourceReview: automatic && !reviewed,
    inspectorName,
    reviewerName,
    canSaveInspection: !automatic && !ownReviewer && (!ownInspector || (!!actorName && actorName.trim() === ownInspector)),
    canApproveReview: !automatic && !!ownInspector && !ownReviewer && !!actorName && actorName.trim() !== ownInspector,
  };
}

export function buildQcBatchWorkflow(detail: QcTemplateDetail, batch: QcBatchSummary, actorName?: string): QcBatchWorkflow {
  const stageTests = detail.stages.map((stage, stageIndex) => stage.tests.map((test) => testStatus(batch, detail, stage, stageIndex, test, actorName)));
  const stages = detail.stages.map((stage, index) => {
    const previousComplete = stageTests.slice(0, index).every((tests) => tests.every((test) => test.complete));
    const tests = stageTests[index] || [];
    return {
      key: stage.key,
      label: stage.label,
      index,
      unlocked: previousComplete,
      complete: tests.every((test) => test.complete),
      tests,
    };
  });
  const tests = stages.flatMap((stage) => stage.tests.map((test) => ({
    ...test,
    canSaveInspection: test.canSaveInspection && stages[test.stageIndex]?.unlocked === true,
    canApproveReview: test.canApproveReview && stages[test.stageIndex]?.unlocked === true,
  })));
  const hasRejected = tests.some((test) => test.rejected);
  const allComplete = tests.length > 0 && tests.every((test) => test.complete);
  const statusLabels: QcBatchStatusLabel[] = hasRejected
    ? ["异常"]
    : allComplete
      ? ["已验收"]
      : [
        ...(tests.some((test) => !test.automatic && !test.inspected) ? ["检验中" as const] : []),
        ...(tests.some((test) => test.inspected && !test.reviewed) ? ["待复核" as const] : []),
      ];
  return {
    stages: stages.map((stage) => ({ ...stage, tests: tests.filter((test) => test.stageKey === stage.key) })),
    tests,
    inspectorNames: uniqueQcNames(tests.map((test) => test.inspectorName)),
    reviewerNames: uniqueQcNames(tests.map((test) => test.reviewerName)),
    statusLabels,
  };
}

export function qcWorkflowStatusText(statusLabels: QcBatchStatusLabel[]) {
  return statusLabels.length ? statusLabels.join(" / ") : "检验中";
}
