import {
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
} from "@workspace/platform/contracts/business-temporal";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "../../business-temporal";
import type { EmploymentAgreementCommand } from "./employment-agreement-validation";

export function employmentAgreementTemporalContractError(
  command: EmploymentAgreementCommand,
  asOfDate: string,
) {
  if (businessTemporalRetrospectiveChanges(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy) === "allow") return null;
  const effectiveDate = command.kind === "create" || command.kind === "renew" || command.kind === "correct"
    ? command.effectiveFrom
    : command.kind === "end"
      ? command.effectiveThrough
      : null;
  return effectiveDate && effectiveDate < asOfDate
    ? "该合同期限不允许补录历史日期"
    : null;
}

export function employmentAgreementTermOverlapError(
  existing: Array<{ recordState: string; effectiveFrom: string | null; effectiveThrough: string | null }>,
  proposed: { effectiveFrom: string; effectiveThrough: string | null },
) {
  if (HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy.overlaps === "allow") return null;
  const proposedWindow = inclusiveBusinessPeriodToWindow({
    validFrom: proposed.effectiveFrom,
    validThrough: proposed.effectiveThrough,
  });
  if (!proposedWindow) return "合同期限无效";
  const overlaps = existing.some((term) => {
    if (term.recordState !== "confirmed" || !term.effectiveFrom) return false;
    const window = inclusiveBusinessPeriodToWindow({
      validFrom: term.effectiveFrom,
      validThrough: term.effectiveThrough,
    });
    return !window || businessDateWindowsOverlap(window, proposedWindow);
  });
  return overlaps ? "合同期限不能与已有期限重叠" : null;
}
