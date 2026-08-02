import type { FinanceCloseBlockerDto, FinanceCloseProviderInspection } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";

type InspectionIdentityInput = Pick<
  FinanceCloseProviderInspection,
  "status" | "blockers" | "evidenceRefs" | "voucherRefs" | "deepLink" | "payload"
>;

function canonicalBlockers(blockers: FinanceCloseBlockerDto[]) {
  return blockers
    .map((item) => ({ code: item.code, message: item.message, deepLink: item.deepLink }))
    .sort((left, right) => left.code.localeCompare(right.code)
      || left.deepLink.localeCompare(right.deepLink)
      || left.message.localeCompare(right.message));
}

function canonicalReferences(refs: string[]) {
  return [...new Set(refs)].sort();
}

export function financeCloseInspectionFingerprint(input: InspectionIdentityInput) {
  return sha256CanonicalJson({
    status: input.status,
    blockers: canonicalBlockers(input.blockers),
    evidenceRefs: canonicalReferences(input.evidenceRefs),
    voucherRefs: canonicalReferences(input.voucherRefs),
    deepLink: input.deepLink,
    payload: input.payload,
  });
}
