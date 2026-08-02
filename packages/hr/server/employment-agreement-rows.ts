import { classifyInclusiveBusinessPeriod } from "@workspace/platform/contracts/business-temporal";
import { businessTemporalBaselineMissingRequiredFields } from "@workspace/platform/contracts/business-temporal-baseline";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { employmentAgreementMissingFieldLabel } from "@workspace/hr/employment-agreement-field-contract";
import type { ContractRow, EmploymentAgreementRevisionRow, EmploymentAgreementTermRow } from "@workspace/hr/types";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "../business-temporal";

export const EMPLOYMENT_AGREEMENT_INCLUDE = {
  currentPublishedRevision: true,
  revisions: {
    orderBy: { revisionNo: "desc" as const },
    include: { supersedes: { select: { revisionUid: true } } },
  },
  terms: { orderBy: { sequence: "asc" as const } },
  attachments: {
    orderBy: [{ removedAt: "asc" as const }, { uploadedAt: "desc" as const }],
    include: { uploader: { select: { alias: true, username: true } } },
  },
  employment: {
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
  },
} satisfies Prisma.EmploymentAgreementInclude;

export function normalizedEmploymentAgreementRow(
  agreement: Awaited<ReturnType<typeof _loadAgreementShape>>,
  asOfDate: string,
): ContractRow {
  const terms = agreement.terms.map((term): EmploymentAgreementTermRow => ({
    termUid: term.termUid,
    sequence: term.sequence,
    termKind: term.termKind as EmploymentAgreementTermRow["termKind"],
    effectiveFrom: term.effectiveFrom ?? null,
    effectiveThrough: term.effectiveThrough,
    recordState: term.recordState as EmploymentAgreementTermRow["recordState"],
    temporalState: classifyInclusiveBusinessPeriod({ validFrom: term.effectiveFrom, validThrough: term.effectiveThrough }, asOfDate),
    changeKind: term.changeKind,
    reason: term.reason,
  }));
  const revisions = agreement.revisions.map((revision): EmploymentAgreementRevisionRow => ({
    revisionUid: revision.revisionUid,
    revisionNo: revision.revisionNo,
    recordState: revision.recordState === "published"
      ? revision.id === agreement.currentPublishedRevisionId ? "confirmed" : "superseded"
      : revision.recordState as EmploymentAgreementRevisionRow["recordState"],
    changeKind: revision.changeKind as EmploymentAgreementRevisionRow["changeKind"],
    content: parseContent(revision.contentJson),
    supersedesRevisionUid: revision.supersedes?.revisionUid ?? null,
    reason: revision.reason,
    createdAt: revision.createdAt.toISOString(),
  }));
  const content = agreement.currentPublishedRevision
    ? parseContent(agreement.currentPublishedRevision.contentJson)
    : emptyContent();
  const confirmedTerms = terms.filter((term) => term.recordState === "confirmed");
  const latestConfirmedTerm = confirmedTerms.at(-1) ?? null;
  const authoritativeTerms = terms.filter((term) => term.recordState === "confirmed" || term.recordState === "unknown");
  const datefulTerms = authoritativeTerms.filter(
    (term): term is EmploymentAgreementTermRow & { effectiveFrom: string } => Boolean(term.effectiveFrom),
  );
  const ordered = [...datefulTerms].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  const primaryState = agreement.actualEndDate
    ? classifyInclusiveBusinessPeriod({ validFrom: ordered[0]?.effectiveFrom ?? null, validThrough: agreement.actualEndDate }, asOfDate)
    : preferredTemporalState(confirmedTerms.length > 0 ? confirmedTerms : terms);
  const isLegacyBaseline = agreement.sourceKind === "legacy-baseline";
  const missingFieldPaths = parseMissingFields(agreement.missingFieldsJson);
  const missingRequiredFields = isLegacyBaseline && HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline
    ? businessTemporalBaselineMissingRequiredFields(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline, missingFieldPaths)
    : [];
  const missingRequiredFieldSet = new Set(missingRequiredFields);
  return {
    id: agreement.agreementUid,
    agreementUid: agreement.agreementUid,
    employmentId: agreement.employmentId,
    employeeId: agreement.employment.employee.employeeId || "",
    employeeName: agreement.employment.employee.name || "",
    company: content.company || "",
    isPrimary: agreement.isPrimary,
    isInsuredHere: false,
    insuranceStatus: content.insuranceStatus,
    legalRelation: content.legalRelation || "",
    contractType: content.contractType || "",
    employmentForm: content.employmentForm || "",
    firstContractStartDate: ordered[0]?.effectiveFrom ?? null,
    firstContractEndDate: ordered[0]?.effectiveThrough ?? null,
    secondContractStartDate: ordered[1]?.effectiveFrom ?? null,
    secondContractEndDate: ordered[1]?.effectiveThrough ?? null,
    thirdContractStartDate: ordered[2]?.effectiveFrom ?? null,
    thirdContractEndDate: ordered[2]?.effectiveThrough ?? null,
    permanentContractDate: ordered.find((term) => term.termKind === "permanent")?.effectiveFrom ?? null,
    expiryDate: latestConfirmedTerm?.effectiveThrough ?? null,
    confidentialityDate: content.confidentialityDate,
    nonCompeteDate: content.nonCompeteDate,
    endDate: agreement.actualEndDate,
    recordState: agreement.recordState as ContractRow["recordState"],
    temporalState: primaryState,
    version: agreement.version,
    source: "normalized",
    migrationState: isLegacyBaseline
      ? missingRequiredFields.length > 0 ? "baseline-incomplete" : "baseline"
      : "normalized",
    missingFields: missingFieldPaths.map((path) => ({
      path,
      label: employmentAgreementMissingFieldLabel(path),
      required: missingRequiredFieldSet.has(path),
    })),
    currentRevisionUid: agreement.currentPublishedRevision?.revisionUid ?? null,
    terms,
    revisions,
    attachments: agreement.attachments.map((attachment) => ({
      attachmentUid: attachment.attachmentUid,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      originalSizeBytes: attachment.originalSizeBytes,
      optimizedSizeBytes: attachment.optimizedSizeBytes,
      optimizationStatus: attachment.optimizationStatus as ContractRow["attachments"][number]["optimizationStatus"],
      optimizationError: attachment.optimizationError,
      compressionSavingsRatio: attachment.compressionSavingsRatio?.toNumber() ?? null,
      pageCount: attachment.pageCount,
      note: attachment.note,
      uploadedByName: attachment.uploader?.alias || attachment.uploader?.username || null,
      uploadedAt: attachment.uploadedAt.toISOString(),
      removedAt: attachment.removedAt?.toISOString() ?? null,
      removalReason: attachment.removalReason,
      version: attachment.version,
    })),
  };
}

function parseMissingFields(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((field): field is string => typeof field === "string")
      : [];
  } catch {
    return [];
  }
}

async function _loadAgreementShape() {
  return prisma.employmentAgreement.findFirstOrThrow({ include: EMPLOYMENT_AGREEMENT_INCLUDE });
}

function parseContent(value: string): EmploymentAgreementRevisionRow["content"] {
  try {
    const parsed = JSON.parse(value) as Partial<EmploymentAgreementRevisionRow["content"]>;
    return { ...emptyContent(), ...parsed };
  } catch {
    return emptyContent();
  }
}

function emptyContent(): EmploymentAgreementRevisionRow["content"] {
  return {
    company: null,
    insuranceStatus: null,
    legalRelation: null,
    contractType: null,
    employmentForm: null,
    confidentialityDate: null,
    nonCompeteDate: null,
  };
}

function preferredTemporalState(terms: EmploymentAgreementTermRow[]) {
  if (terms.some((term) => term.temporalState === "current")) return "current" as const;
  if (terms.some((term) => term.temporalState === "upcoming")) return "upcoming" as const;
  if (terms.some((term) => term.temporalState === "invalid")) return "invalid" as const;
  return terms.length > 0 ? "past" as const : "invalid" as const;
}
