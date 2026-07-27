import type { Prisma } from "@workspace/platform/server/prisma";
import { employmentAgreementBaselineMissingFields } from "../employment-agreement-baseline-contract.mjs";
import {
  validateEmploymentAgreementMissingFields,
  type EmploymentAgreementContent,
} from "./domain/employment-agreement-validation";

export function parseEmploymentAgreementMissingFields(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((field): field is string => typeof field === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseEmploymentAgreementContent(value: string | undefined) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function normalizedEmploymentAgreementContent(value: Record<string, unknown>): EmploymentAgreementContent {
  return {
    company: typeof value.company === "string" ? value.company : null,
    insuranceStatus: typeof value.insuranceStatus === "string" ? value.insuranceStatus : null,
    legalRelation: typeof value.legalRelation === "string" ? value.legalRelation : null,
    contractType: typeof value.contractType === "string" ? value.contractType : null,
    employmentForm: typeof value.employmentForm === "string" ? value.employmentForm : null,
    confidentialityDate: typeof value.confidentialityDate === "string" ? value.confidentialityDate as EmploymentAgreementContent["confidentialityDate"] : null,
    nonCompeteDate: typeof value.nonCompeteDate === "string" ? value.nonCompeteDate as EmploymentAgreementContent["nonCompeteDate"] : null,
  };
}

export async function refreshEmploymentAgreementBaselineMissingFields(
  tx: Prisma.TransactionClient,
  agreementId: number,
) {
  const agreement = await tx.employmentAgreement.findUnique({
    where: { id: agreementId },
    select: {
      sourceKind: true,
      currentPublishedRevision: { select: { contentJson: true } },
      terms: {
        where: { recordState: "confirmed" },
        select: {
          sequence: true,
          termKind: true,
          effectiveFrom: true,
          effectiveThrough: true,
        },
      },
    },
  });
  if (!agreement || agreement.sourceKind !== "legacy-baseline") return;
  const missingFields = validateEmploymentAgreementMissingFields(employmentAgreementBaselineMissingFields(
    parseEmploymentAgreementContent(agreement.currentPublishedRevision?.contentJson),
    agreement.terms,
  ));
  if (!missingFields.ok) throw new Error(missingFields.issue.message);
  await tx.employmentAgreement.update({
    where: { id: agreementId },
    data: {
      missingFieldsJson: JSON.stringify(missingFields.data),
    },
  });
}
