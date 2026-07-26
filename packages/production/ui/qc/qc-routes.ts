import { workspacePath } from "@workspace/core/routing";

export function qcPath() {
  return "/production/qc";
}

export function qcBatchStagePath(batchId: number | string, stageKey: string) {
  return `${qcPath()}/${batchId}/${stageKey}`;
}

export function qcBatchTestPath(batchId: number | string, stageKey: string, testKey: string) {
  return `${qcBatchStagePath(batchId, stageKey)}/${testKey}`;
}

export function qcAnchorHref() {
  return workspacePath(qcPath());
}

export function qcBatchStageAnchorHref(batchId: number | string, stageKey: string) {
  return workspacePath(qcBatchStagePath(batchId, stageKey));
}

export function qcBatchTestAnchorHref(batchId: number | string, stageKey: string, testKey: string) {
  return workspacePath(qcBatchTestPath(batchId, stageKey, testKey));
}
