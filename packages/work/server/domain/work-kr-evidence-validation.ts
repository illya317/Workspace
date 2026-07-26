import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

const WORK_KR_EVIDENCE_ACTIONS = ["replaceKrEvidenceTasks"] as const;

export type WorkKrEvidenceAction = (typeof WORK_KR_EVIDENCE_ACTIONS)[number];

export function validateWorkKrEvidenceCommand(action: string): DomainValidationResult<WorkKrEvidenceAction> {
  if (!(WORK_KR_EVIDENCE_ACTIONS as readonly string[]).includes(action)) {
    return failCommand("KR 证据操作无效");
  }
  return okCommand(action as WorkKrEvidenceAction);
}
