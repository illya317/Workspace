import type { EditorBlock, EditorSlotInline } from "@workspace/platform/document-editor";
import type { WorkflowStatus } from "@workspace/platform/ui";
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

export interface QcPrecheckSignatureKeys {
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
  precheckKeys: QcPrecheckSignatureKeys;
  precheckInspected: boolean;
  precheckReviewed: boolean;
  precheckComplete: boolean;
  precheckInspectorName: string;
  precheckReviewerName: string;
  canSavePrecheck: boolean;
  canApprovePrecheck: boolean;
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

export function qcBatchReviewWorkflowStatus(statusLabels: readonly QcBatchStatusLabel[]): WorkflowStatus {
  if (statusLabels.includes("异常")) return "rejected";
  if (statusLabels.includes("已验收")) return "approved";
  if (statusLabels.includes("待复核")) return "submitted";
  return "in_review";
}

export function qcStageReviewWorkflowStatus(status: QcStageWorkflowStatus | undefined, locked: boolean): WorkflowStatus | null {
  if (locked) return null;
  if (status?.tests.some((test) => test.rejected)) return "rejected";
  if (status?.complete) return "approved";
  if (status?.precheckInspected && !status.precheckReviewed) return "submitted";
  if (status?.tests.some((test) => test.inspected && !test.reviewed)) return "submitted";
  return "in_review";
}

export function qcTestReviewWorkflowStatus(test: QcTestWorkflowStatus, locked: boolean): WorkflowStatus | null {
  if (locked) return null;
  if (test.rejected) return "rejected";
  if (test.complete) return "approved";
  if (test.inspected && !test.reviewed) return "submitted";
  return "in_review";
}

export function qcSignatureKeys(stageKey: string, testName: string): QcTestSignatureKeys {
  return {
    inspector: `${stageKey}/${testName}/signature/inspector`,
    reviewer: `${stageKey}/${testName}/signature/reviewer`,
  };
}

export function qcPrecheckSignatureKeys(stageKey: string): QcPrecheckSignatureKeys {
  return {
    inspector: `${stageKey}/precheck/signature/inspector`,
    reviewer: `${stageKey}/precheck/signature/reviewer`,
  };
}

export function qcPrecheckCompletionKey(stageKey: string) {
  return qcPrecheckSignatureKeys(stageKey).reviewer;
}

export function uniqueQcNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function signatureIdentity(value: string | undefined) {
  return (value || "").trim().split(/\s+/, 1)[0];
}

export function buildQcBatchWorkflow(template: QcWorkflowTemplate, batch: QcBatchSummary, actorName?: string): QcBatchWorkflow {
  const stageTests = template.stages.map((stage, stageIndex) => stage.tests.map((test) => testStatus(batch, template, stage, stageIndex, test, actorName)));
  const stagePrechecks = template.stages.map((stage) => precheckStatus(batch, stage, actorName));
  const stages = template.stages.map((stage, index) => {
    const previousComplete = template.stages.slice(0, index).every((_, previousIndex) => (
      stagePrechecks[previousIndex]?.reviewed === true
      && (stageTests[previousIndex] || []).every((test) => test.complete)
    ));
    const tests = stageTests[index] || [];
    const precheck = stagePrechecks[index] ?? precheckStatus(batch, stage, actorName);
    return {
      key: stage.key,
      label: stage.label,
      index,
      unlocked: previousComplete,
      precheckKeys: precheck.keys,
      precheckInspected: precheck.inspected,
      precheckReviewed: precheck.reviewed,
      precheckComplete: precheck.reviewed,
      precheckInspectorName: precheck.inspectorName,
      precheckReviewerName: precheck.reviewerName,
      canSavePrecheck: precheck.canSavePrecheck && previousComplete,
      canApprovePrecheck: precheck.canApprovePrecheck && previousComplete,
      complete: precheck.reviewed && tests.every((test) => test.complete),
      tests,
    };
  });
  const tests = stages.flatMap((stage) => stage.tests.map((test) => ({
    ...test,
    canSaveInspection: test.canSaveInspection && stages[test.stageIndex]?.unlocked === true,
    canApproveReview: test.canApproveReview && stages[test.stageIndex]?.unlocked === true,
  })));
  const hasRejected = tests.some((test) => test.rejected);
  const allComplete = stages.length > 0 && stages.every((stage) => stage.complete);
  const hasPendingReview = stages.some((stage) => stage.precheckInspected && !stage.precheckReviewed) || tests.some((test) => test.inspected && !test.reviewed);
  const hasInspectionWork = stages.some((stage) => !stage.precheckInspected) || tests.some((test) => !test.automatic && !test.inspected);
  const statusLabels: QcBatchStatusLabel[] = hasRejected
    ? ["异常"]
    : allComplete
      ? ["已验收"]
      : [
        ...(hasInspectionWork ? ["检验中" as const] : []),
        ...(hasPendingReview ? ["待复核" as const] : []),
      ];
  return {
    stages: stages.map((stage) => ({ ...stage, tests: tests.filter((test) => test.stageKey === stage.key) })),
    tests,
    inspectorNames: uniqueQcNames([...stages.map((stage) => stage.precheckInspectorName), ...tests.map((test) => test.inspectorName)]),
    reviewerNames: uniqueQcNames([...stages.map((stage) => stage.precheckReviewerName), ...tests.map((test) => test.reviewerName)]),
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
    canSaveInspection: !automatic && !ownReviewer && (!ownInspector || (!!actorName && signatureIdentity(actorName) === signatureIdentity(ownInspector))),
    canApproveReview: !automatic && !!ownInspector && !ownReviewer && !!actorName && signatureIdentity(actorName) !== signatureIdentity(ownInspector),
  };
}

function precheckStatus(
  batch: QcBatchSummary,
  stage: QcWorkflowStageTemplate,
  actorName?: string,
) {
  const keys = qcPrecheckSignatureKeys(stage.key);
  const inspectorName = fieldValue(batch, keys.inspector);
  const reviewerName = fieldValue(batch, keys.reviewer);
  const actor = signatureIdentity(actorName);
  return {
    keys,
    inspected: !!inspectorName,
    reviewed: !!reviewerName,
    inspectorName,
    reviewerName,
    canSavePrecheck: !reviewerName && (!inspectorName || (!!actor && actor === signatureIdentity(inspectorName))),
    canApprovePrecheck: !!inspectorName && !reviewerName && !!actor && actor !== signatureIdentity(inspectorName),
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
