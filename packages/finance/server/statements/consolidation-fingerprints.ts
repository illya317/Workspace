import { createHash } from "node:crypto";

type DateFact = Date | string | null | undefined;

function dateValue(value: DateFact) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const jsonValue = "toJSON" in value && typeof value.toJSON === "function"
    ? value.toJSON()
    : value;
  if (jsonValue !== value) return canonicalValue(jsonValue);
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
}

export function consolidationFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

export function consolidationScopeFingerprint(entities: {
  companyId: number;
  companyCode: string;
  companyName: string;
  role: string;
  directParentCompanyId: number | null;
  directParentCode: string | null;
  relationId: number | null;
  relationUpdatedAt: DateFact;
  relationEffectiveFrom: DateFact;
  relationEffectiveTo: DateFact;
  relationVersion: number | null;
  shareRatio: { toString(): string } | number | null;
  isConsolidated?: boolean;
  functionalCurrency: string | null;
  currencyEvidence: string | null;
  currencyDecidedBy: number | null;
}[]) {
  return consolidationFingerprint([...entities]
    .sort((left, right) => left.companyId - right.companyId)
    .map((entity) => ({
      companyId: entity.companyId,
      companyCode: entity.companyCode,
      companyName: entity.companyName,
      role: entity.role,
      directParentCompanyId: entity.directParentCompanyId,
      directParentCode: entity.directParentCode,
      relationId: entity.relationId,
      relationUpdatedAt: dateValue(entity.relationUpdatedAt),
      relationEffectiveFrom: dateValue(entity.relationEffectiveFrom),
      relationEffectiveTo: dateValue(entity.relationEffectiveTo),
      relationVersion: entity.relationVersion,
      shareRatio: entity.shareRatio === null ? null : Number(entity.shareRatio),
      isConsolidated: entity.isConsolidated ?? true,
      functionalCurrency: entity.functionalCurrency,
      currencyEvidence: entity.currencyEvidence,
      currencyDecidedBy: entity.currencyDecidedBy,
    })));
}

export function consolidationSourceFactFingerprint(source: {
  companyId: number;
  reportType: string;
  sourceKind: string;
  sourceStatus: string;
  workpaperId: number | null;
  workpaperVersion: number | null;
  sourceChecksum: string | null;
  workpaperUpdatedBy: number | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackageStatus: string | null;
  sourcePackageChecksum: string | null;
  sourcePackageUploadedBy: number | null;
  sourcePackageSubmittedBy: number | null;
  lineCount: number;
  sourcedLineCount: number;
  importedLineCount: number;
  manualLineCount: number;
  formulaLineCount: number;
  reportPayload: unknown;
  evidence: string | null;
}) {
  return consolidationFingerprint({
    companyId: source.companyId,
    reportType: source.reportType,
    sourceKind: source.sourceKind,
    sourceStatus: source.sourceStatus,
    workpaperId: source.workpaperId,
    workpaperVersion: source.workpaperVersion,
    sourceChecksum: source.sourceChecksum,
    workpaperUpdatedBy: source.workpaperUpdatedBy,
    sourcePackageId: source.sourcePackageId,
    sourcePackageRevision: source.sourcePackageRevision,
    sourcePackageStatus: source.sourcePackageStatus,
    sourcePackageChecksum: source.sourcePackageChecksum,
    sourcePackageUploadedBy: source.sourcePackageUploadedBy,
    sourcePackageSubmittedBy: source.sourcePackageSubmittedBy,
    lineCount: source.lineCount,
    sourcedLineCount: source.sourcedLineCount,
    importedLineCount: source.importedLineCount,
    manualLineCount: source.manualLineCount,
    formulaLineCount: source.formulaLineCount,
    reportPayload: source.reportPayload,
    evidence: source.evidence,
  });
}

export function consolidationSourceBatchFingerprint(sources: {
  companyId: number;
  reportType: string;
  fingerprint: string;
}[]) {
  return consolidationFingerprint([...sources]
    .sort((left, right) => left.companyId - right.companyId || left.reportType.localeCompare(right.reportType))
    .map((source) => [source.companyId, source.reportType, source.fingerprint]));
}

function reportContentValue(reportPayload: unknown) {
  if (!reportPayload || typeof reportPayload !== "object" || Array.isArray(reportPayload)) {
    return reportPayload;
  }
  const record = reportPayload as Record<string, unknown>;
  return "payload" in record
    ? {
        httpStatus: record.httpStatus ?? null,
        payload: record.payload,
        monthlyPeriods: record.monthlyPeriods ?? null,
        equityRollforward: record.equityRollforward ?? null,
      }
    : reportPayload;
}

export function consolidationSourceContentFingerprint(source: {
  companyId: number;
  reportType: string;
  sourceKind: string;
  sourceStatus: string;
  workpaperId: number | null;
  workpaperVersion: number | null;
  sourceChecksum: string | null;
  workpaperUpdatedBy: number | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackageStatus: string | null;
  sourcePackageChecksum: string | null;
  sourcePackageUploadedBy: number | null;
  sourcePackageSubmittedBy: number | null;
  lineCount: number;
  sourcedLineCount: number;
  importedLineCount: number;
  manualLineCount: number;
  formulaLineCount: number;
  reportPayload: unknown;
  evidence: string | null;
}) {
  return consolidationFingerprint({
    companyId: source.companyId,
    reportType: source.reportType,
    sourceKind: source.sourceKind,
    sourceStatus: source.sourceStatus,
    workpaperId: source.workpaperId,
    workpaperVersion: source.workpaperVersion,
    sourceChecksum: source.sourceChecksum,
    workpaperUpdatedBy: source.workpaperUpdatedBy,
    sourcePackageId: source.sourcePackageId,
    sourcePackageRevision: source.sourcePackageRevision,
    sourcePackageStatus: source.sourcePackageStatus,
    sourcePackageChecksum: source.sourcePackageChecksum,
    sourcePackageUploadedBy: source.sourcePackageUploadedBy,
    sourcePackageSubmittedBy: source.sourcePackageSubmittedBy,
    lineCount: source.lineCount,
    sourcedLineCount: source.sourcedLineCount,
    importedLineCount: source.importedLineCount,
    manualLineCount: source.manualLineCount,
    formulaLineCount: source.formulaLineCount,
    reportPayload: reportContentValue(source.reportPayload),
    evidence: source.evidence,
  });
}

export function consolidationSourceContentBatchFingerprint(sources: Parameters<typeof consolidationSourceContentFingerprint>[0][]) {
  return consolidationFingerprint([...sources]
    .sort((left, right) => left.companyId - right.companyId || left.reportType.localeCompare(right.reportType))
    .map((source) => [
      source.companyId,
      source.reportType,
      consolidationSourceContentFingerprint(source),
    ]));
}

export function consolidationRateFingerprint(rates: {
  exchangeRateId: number;
  exchangeRateVersion: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: string;
  rateDate: string;
  rate: { toString(): string } | number;
  sourceUrl: string;
  publishedAt?: DateFact;
  recordedBy: number | null;
  recordedAt: DateFact;
  applications: unknown;
}[]) {
  return consolidationFingerprint([...rates]
    .sort((left, right) => left.exchangeRateId - right.exchangeRateId)
    .map((rate) => ({
      exchangeRateId: rate.exchangeRateId,
      exchangeRateVersion: rate.exchangeRateVersion,
      baseCurrency: rate.baseCurrency,
      quoteCurrency: rate.quoteCurrency,
      rateKind: rate.rateKind,
      rateDate: rate.rateDate,
      rate: Number(rate.rate),
      sourceUrl: rate.sourceUrl,
      publishedAt: dateValue(rate.publishedAt),
      recordedBy: rate.recordedBy,
      recordedAt: dateValue(rate.recordedAt),
      applications: Array.isArray(rate.applications)
        ? [...rate.applications].sort((left, right) =>
            consolidationFingerprint(left).localeCompare(consolidationFingerprint(right)),
          )
        : rate.applications,
    })));
}
