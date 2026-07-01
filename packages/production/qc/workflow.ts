import type { EditorBlock, EditorSlotInline } from "@workspace/platform/document-editor";
import type { QcBatchSummary } from "../types";

export type QcBatchStatusLabel = "异常" | "已验收" | "检验中" | "待复核";

export interface QcWorkflowTestTemplate {
  key: string;
  sequence: string;
  name: string;
  blocks: EditorBlock[];
}

export interface QcWorkflowStageTemplate {
  key: string;
  label: string;
  index: number;
  tests: QcWorkflowTestTemplate[];
}

export interface QcWorkflowTemplate {
  stages: QcWorkflowStageTemplate[];
}

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
  precheckComplete: boolean;
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

export function qcPrecheckCompletionKey(stageKey: string) {
  return `${stageKey}/precheck/signature/inspector`;
}

export function uniqueQcNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

export function buildQcBatchWorkflow(template: QcWorkflowTemplate, batch: QcBatchSummary, actorName?: string): QcBatchWorkflow {
  const stageTests = template.stages.map((stage, stageIndex) => stage.tests.map((test) => testStatus(batch, template, stage, stageIndex, test, actorName)));
  const stages = template.stages.map((stage, index) => {
    const previousComplete = template.stages.slice(0, index).every((previousStage, previousIndex) => (
      !!fieldValue(batch, qcPrecheckCompletionKey(previousStage.key))
      && (stageTests[previousIndex] || []).every((test) => test.complete)
    ));
    const tests = stageTests[index] || [];
    const precheckComplete = !!fieldValue(batch, qcPrecheckCompletionKey(stage.key));
    return {
      key: stage.key,
      label: stage.label,
      index,
      unlocked: previousComplete,
      precheckComplete,
      complete: precheckComplete && tests.every((test) => test.complete),
      tests,
    };
  });
  const tests = stages.flatMap((stage) => stage.tests.map((test) => ({
    ...test,
    canSaveInspection: test.canSaveInspection && stages[test.stageIndex]?.unlocked === true && stages[test.stageIndex]?.precheckComplete === true,
    canApproveReview: test.canApproveReview && stages[test.stageIndex]?.unlocked === true && stages[test.stageIndex]?.precheckComplete === true,
  })));
  const hasRejected = tests.some((test) => test.rejected);
  const allComplete = stages.length > 0 && stages.every((stage) => stage.complete);
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

function testStatus(
  batch: QcBatchSummary,
  template: QcWorkflowTemplate,
  stage: QcWorkflowStageTemplate,
  stageIndex: number,
  test: QcWorkflowTestTemplate,
  actorName?: string,
): QcTestWorkflowStatus {
  const keys = qcSignatureKeys(stage.key, test.key);
  const sourceKeys = findSourceKeys(template, stage, test);
  const automatic = !hasWritableSlots(test) && !!sourceKeys;
  const ownInspector = fieldValue(batch, keys.inspector);
  const ownReviewer = fieldValue(batch, keys.reviewer);
  const sourceInspector = fieldValue(batch, sourceKeys?.inspector);
  const sourceReviewer = fieldValue(batch, sourceKeys?.reviewer);
  const inspectorName = automatic ? sourceInspector : ownInspector;
  const reviewerName = automatic ? sourceReviewer : ownReviewer;
  const inspected = automatic ? !!sourceInspector : !!ownInspector;
  const reviewed = automatic ? !!sourceReviewer : !!ownReviewer;
  const rejected = automatic
    ? !!sourceReviewer && !!sourceKeys && template.stages.some((sourceStage) => sourceStage.tests.some((sourceTest) => (
      sourceKeys.inspector === qcSignatureKeys(sourceStage.key, sourceTest.key).inspector
      && testHasRejectedResult(batch, sourceTest)
    )))
    : !!ownReviewer && testHasRejectedResult(batch, test);
  return {
    stageKey: stage.key,
    stageIndex,
    testName: test.key,
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

function fieldValue(batch: QcBatchSummary, key?: string) {
  return key ? String(batch.fields[key] || "").trim() : "";
}

function testHasRejectedResult(batch: QcBatchSummary, test: QcWorkflowTestTemplate) {
  return testValueKeys(test).some((key) => String(batch.fields[key] || "").includes("不符合"));
}

function findSourceKeys(template: QcWorkflowTemplate, currentStage: QcWorkflowStageTemplate, currentTest: QcWorkflowTestTemplate) {
  const references = new Set<string>();
  forEachSlot(currentTest, (slot) => {
    if (slot.referenceFieldKey) references.add(slot.referenceFieldKey);
  });
  for (const stage of template.stages) {
    for (const test of stage.tests) {
      if (stage.key === currentStage.key && test.key === currentTest.key) continue;
      if (testValueKeys(test).some((key) => references.has(key))) return qcSignatureKeys(stage.key, test.key);
    }
  }
  return undefined;
}

function hasWritableSlots(test: QcWorkflowTestTemplate) {
  let writable = false;
  forEachSlot(test, (slot) => {
    if (!slot.referenceFieldKey && !slot.fieldKey.includes("/signature/") && slot.slotKind !== "formula" && slot.slotKind !== "reference" && !slot.readonlyDisplay) writable = true;
  });
  return writable;
}

function testValueKeys(test: QcWorkflowTestTemplate) {
  const keys = new Set<string>();
  forEachSlot(test, (slot) => {
    if (!slot.fieldKey.includes("/signature/")) keys.add(slot.fieldKey);
    if (slot.referenceFieldKey) keys.add(slot.referenceFieldKey);
  });
  return [...keys];
}

function forEachSlot(test: QcWorkflowTestTemplate, visit: (slot: EditorSlotInline) => void) {
  for (const block of test.blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text") visit(part); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text") visit(part);
      })));
    }
  }
}
