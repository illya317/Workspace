import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export type CanonicalCounterpartyType = "customer" | "supplier" | "person" | "other";

export const TPLUS_COUNTERPARTY_CLASSIFICATION_METHOD = "tplus_account_semantics_v1";

export interface TPlusCounterpartyCandidate {
  memberId: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  rawDimensionType: string;
}

interface LockedCounterpartyClassification {
  counterpartyType: string;
  classificationMethod: string;
  classificationEvidence: string;
}

interface TPlusCounterpartyClassificationCommand {
  classification: {
    memberId: number;
    accountId: number;
    counterpartyType: CanonicalCounterpartyType;
    classificationMethod: string;
    classificationEvidence: string;
  };
  alreadyLocked: boolean;
}

export function classifyTPlusCounterparty(
  input: Pick<TPlusCounterpartyCandidate, "accountCode" | "accountName" | "rawDimensionType">,
): CanonicalCounterpartyType {
  const code = input.accountCode.trim();
  const name = input.accountName.trim();
  if (input.rawDimensionType === "person" || name.includes("个人") || code.startsWith("224102")) return "person";
  if (["1123", "2201", "2202", "224101"].some((prefix) => code.startsWith(prefix))) return "supplier";
  if (["1121", "1122", "1221", "2203"].some((prefix) => code.startsWith(prefix))) return "customer";
  if (input.rawDimensionType === "customer" || input.rawDimensionType === "supplier") return input.rawDimensionType;
  return "other";
}

export function buildTPlusCounterpartyClassificationCommand(
  candidate: TPlusCounterpartyCandidate,
  locked: LockedCounterpartyClassification | null,
): DomainValidationResult<TPlusCounterpartyClassificationCommand> {
  if (!Number.isInteger(candidate.memberId) || candidate.memberId <= 0) {
    return failCommand("TPlus往来对象无效", 400, "memberId");
  }
  if (!Number.isInteger(candidate.accountId) || candidate.accountId <= 0) {
    return failCommand("TPlus往来科目无效", 400, "accountId");
  }
  if (!candidate.accountCode.trim() || !candidate.accountName.trim() || !candidate.rawDimensionType.trim()) {
    return failCommand("TPlus往来归类证据不完整", 400, "classificationEvidence");
  }
  const counterpartyType = classifyTPlusCounterparty(candidate);
  const classificationEvidence = [
    `account=${candidate.accountCode} ${candidate.accountName}`,
    `rawDimension=${candidate.rawDimensionType}`,
  ].join("; ");
  const classification = {
    memberId: candidate.memberId,
    accountId: candidate.accountId,
    counterpartyType,
    classificationMethod: TPLUS_COUNTERPARTY_CLASSIFICATION_METHOD,
    classificationEvidence,
  };
  if (locked && (
    locked.counterpartyType !== classification.counterpartyType
    || locked.classificationMethod !== classification.classificationMethod
    || locked.classificationEvidence !== classification.classificationEvidence
  )) {
    return failCommand(
      `TPlus往来归类已锁定且与重算结果不一致：${candidate.accountCode}/${candidate.memberId}`,
      409,
      "classification",
    );
  }
  return okCommand({ classification, alreadyLocked: Boolean(locked) });
}
