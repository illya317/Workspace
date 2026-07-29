import type { FinanceSourceTraceInput, TaxWorkspaceDto } from "../../types/tax";
import type {
  AccrualLineRow,
  FilingRow,
  PaymentRow,
  RegistrationRow,
  SnapshotRow,
  TaxTypeRow,
  TaxWorkspace,
  WorkpaperRow,
} from "./tax-ui-model";

export function normalizeTaxWorkspace(dto: TaxWorkspaceDto): TaxWorkspace {
  return {
    ...dto,
    taxTypes: dto.taxTypes.map(toTaxTypeRow),
    registrations: dto.registrations.map(toRegistrationRow),
    workpapers: dto.workpapers.map(toWorkpaperRow),
    filings: dto.filings.map(toFilingRow),
    payments: dto.payments.map(toPaymentRow),
    reconciliationSnapshots: dto.reconciliationSnapshots.map(toSnapshotRow),
  };
}

function toTaxTypeRow(row: Record<string, unknown>): TaxTypeRow {
  return {
    id: numberValue(row.id),
    code: stringValue(row.code),
    name: stringValue(row.name),
    jurisdiction: stringValue(row.jurisdiction),
    calculationMethod: stringValue(row.calculationMethod),
  };
}

function toRegistrationRow(row: Record<string, unknown>): RegistrationRow {
  const taxType = recordValue(row.taxType);
  const authority = recordValue(row.authorityParty);
  return {
    ...traceFromRecord(row),
    id: numberValue(row.id),
    taxTypeId: numberValue(row.taxTypeId),
    authorityPartyId: nullableNumber(row.authorityPartyId),
    registrationNo: stringValue(row.registrationNo),
    jurisdiction: stringValue(row.jurisdiction),
    filingFrequency: enumValue(row.filingFrequency, ["monthly", "quarterly", "annual", "event"], "monthly"),
    effectiveFrom: dateOnly(row.effectiveFrom),
    effectiveThrough: nullableDate(row.effectiveThrough),
    status: enumValue(row.status, ["draft", "active", "suspended", "ended"], "draft"),
    version: numberValue(row.version),
    taxType: taxType ? toTaxTypeRow(taxType) : null,
    authorityPartyName: authority ? stringValue(authority.name) : null,
  };
}

function toWorkpaperRow(row: Record<string, unknown>): WorkpaperRow {
  return {
    ...traceFromRecord(row),
    id: numberValue(row.id),
    registrationId: numberValue(row.registrationId),
    periodId: numberValue(row.periodId),
    status: enumValue(row.status, ["draft", "prepared", "reconciled", "blocked"], "draft"),
    calculationVersion: stringValue(row.calculationVersion),
    inputFingerprint: stringValue(row.inputFingerprint),
    note: nullableString(row.note),
    version: numberValue(row.version),
    calculatedAmount: nullableNumber(row.calculatedAmount),
    sourceReportedAmount: nullableNumber(row.sourceReportedAmount),
    sourceDifference: nullableNumber(row.sourceDifference),
    accrualLines: arrayRecords(row.accrualLines).map(toAccrualLineRow),
  };
}

function toAccrualLineRow(row: Record<string, unknown>): AccrualLineRow {
  return {
    ...traceFromRecord(row),
    id: numberValue(row.id),
    lineNo: numberValue(row.lineNo),
    recognitionOn: nullableDate(row.recognitionOn),
    description: stringValue(row.description),
    voucherItemId: nullableNumber(row.voucherItemId),
    voucherItemLabel: nullableString(row.voucherItemLabel),
    taxBaseAmount: nullableNumber(row.taxBaseAmount),
    taxRate: nullableNumber(row.taxRate),
    quantity: nullableNumber(row.quantity),
    unitRate: nullableNumber(row.unitRate),
    divisor: nullableNumber(row.divisor),
    sourceReportedTaxAmount: nullableNumber(row.sourceReportedTaxAmount),
    method: enumValueOrNull(row.method, ["base_rate", "quantity_unit_rate"]),
    calculatedAmount: nullableNumber(row.calculatedAmount),
    sourceReportedAmount: nullableNumber(row.sourceReportedAmount),
    sourceDifference: nullableNumber(row.sourceDifference),
  };
}

function toFilingRow(row: Record<string, unknown>): FilingRow {
  const reconciliation = recordValue(row.reconciliation) ?? {};
  return {
    ...traceFromRecord(row),
    id: numberValue(row.id),
    registrationId: numberValue(row.registrationId),
    periodId: numberValue(row.periodId),
    filingReference: nullableString(row.filingReference),
    filedOn: nullableDate(row.filedOn),
    status: enumValue(row.status, ["draft", "filed", "accepted", "amended", "cancelled"], "draft"),
    currencyCode: stringValue(row.currencyCode),
    sourceReportedDeclaredAmount: nullableNumber(row.sourceReportedDeclaredAmount),
    sourceReportedPayableAmount: nullableNumber(row.sourceReportedPayableAmount),
    note: nullableString(row.note),
    version: numberValue(row.version),
    reconciliation: {
      calculatedAmount: nullableNumber(reconciliation.calculatedAmount),
      declaredAmount: nullableNumber(reconciliation.declaredAmount),
      payableAmount: nullableNumber(reconciliation.payableAmount),
      paidAmount: nullableNumber(reconciliation.paidAmount),
      asOfDate: nullableDate(reconciliation.asOfDate),
      filingEvidenceComplete: reconciliation.filingEvidenceComplete === true,
      paymentEvidenceComplete: reconciliation.paymentEvidenceComplete === true,
      effectivePaymentIds: Array.isArray(reconciliation.effectivePaymentIds)
        ? reconciliation.effectivePaymentIds.map(numberValue).filter((value) => value > 0)
        : [],
      calculatedToDeclaredDifference: nullableNumber(reconciliation.calculatedToDeclaredDifference),
      declaredToPayableDifference: nullableNumber(reconciliation.declaredToPayableDifference),
      payableToPaidDifference: nullableNumber(reconciliation.payableToPaidDifference),
    },
  };
}

function toPaymentRow(row: Record<string, unknown>): PaymentRow {
  return {
    ...traceFromRecord(row),
    id: numberValue(row.id),
    paymentKind: enumValue(row.paymentKind, ["payment", "refund", "reversal"], "payment"),
    paidOn: dateOnly(row.paidOn),
    amount: numberValue(row.amount),
    currencyCode: stringValue(row.currencyCode),
    paymentReference: nullableString(row.paymentReference),
    note: nullableString(row.note),
    reversesPaymentId: nullableNumber(row.reversesPaymentId),
    idempotencyKey: stringValue(row.idempotencyKey),
    allocatedAmount: numberValue(row.allocatedAmount),
    unallocatedAmount: numberValue(row.unallocatedAmount),
    allocations: arrayRecords(row.allocations).map((allocation) => ({
      ...traceFromRecord(allocation),
      id: nullableNumber(allocation.id) ?? undefined,
      filingId: numberValue(allocation.filingId),
      voucherItemId: nullableNumber(allocation.voucherItemId),
      voucherItemLabel: nullableString(allocation.voucherItemLabel),
      allocatedAmount: numberValue(allocation.allocatedAmount),
    })),
  };
}

function toSnapshotRow(row: Record<string, unknown>): SnapshotRow {
  return {
    id: numberValue(row.id),
    registrationId: numberValue(row.registrationId),
    status: stringValue(row.status),
    inputFingerprint: stringValue(row.inputFingerprint),
    payloadSha256: stringValue(row.payloadSha256),
    contributorVersion: stringValue(row.contributorVersion),
    capturedAt: stringValue(row.capturedAt),
  };
}

function traceFromRecord(row: Record<string, unknown>): FinanceSourceTraceInput {
  return {
    sourceKind: nullableString(row.sourceKind),
    sourceReleaseId: nullableString(row.sourceReleaseId),
    sourceSha256: nullableString(row.sourceSha256),
    sourceFile: nullableString(row.sourceFile),
    sourceSheet: nullableString(row.sourceSheet),
    sourceRow: nullableNumber(row.sourceRow),
    sourceRange: nullableString(row.sourceRange),
    sourceKey: nullableString(row.sourceKey),
  };
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value);
  return text || null;
}

function dateOnly(value: unknown) {
  return stringValue(value).slice(0, 10);
}

function nullableDate(value: unknown) {
  const date = dateOnly(value);
  return date || null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.flatMap((row) => recordValue(row) ? [row as Record<string, unknown>] : []) : [];
}

function enumValue<const T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

function enumValueOrNull<const T extends string>(value: unknown, options: readonly T[]): T | null {
  return options.includes(value as T) ? value as T : null;
}
