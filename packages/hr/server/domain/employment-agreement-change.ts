import type { EmploymentAgreementCommand } from "./employment-agreement-validation";

/** Compact, non-sensitive effect summary persisted with the idempotent command ledger. */
export function employmentAgreementChangeManifest(command: EmploymentAgreementCommand) {
  return {
    kind: command.kind,
    agreementUid: "agreementUid" in command ? command.agreementUid : null,
    replacesAgreementUid: command.kind === "replace" ? command.agreementUid : null,
    employmentId: command.kind === "create" || command.kind === "replace" ? command.employmentId : null,
    termUid: "termUid" in command ? command.termUid : null,
    effectiveFrom: "effectiveFrom" in command ? command.effectiveFrom : null,
    effectiveThrough: "effectiveThrough" in command ? command.effectiveThrough : null,
    termPatch: command.kind === "supplement-term" ? command.patch : null,
    sourceKind: command.sourceKind,
    sourceRef: command.sourceRef,
  };
}
