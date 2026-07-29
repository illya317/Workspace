import type {
  FinanceSourceTraceInput,
  TaxAccrualLineInput,
  TaxCreateInput,
  TaxPaymentAllocationInput,
  TaxUpdateInput,
} from "../../types/tax";
import type {
  AccrualLineDraft,
  AllocationDraft,
  FilingDraft,
  FilingRow,
  PaymentDraft,
  RegistrationDraft,
  RegistrationRow,
  SourceDraft,
  TaxCreateKind,
  TaxDraft,
  TaxWorkspace,
  WorkpaperDraft,
  WorkpaperRow,
} from "./tax-ui-types";

export type * from "./tax-ui-types";

const EMPTY_SOURCE: SourceDraft = {
  sourceKind: "manual",
  sourceReleaseId: "",
  sourceFile: "",
  sourceKey: "",
};

export function createTaxDraft(
  kind: TaxCreateKind,
  scope: { companyCode: string; year: number; month: number },
): TaxDraft {
  if (kind === "registration") {
    return {
      ...EMPTY_SOURCE,
      kind,
      taxTypeId: "",
      authorityPartyId: "",
      authorityPartyName: "",
      registrationNo: "",
      jurisdiction: "",
      filingFrequency: "monthly",
      effectiveFrom: `${scope.year}-${String(scope.month).padStart(2, "0")}-01`,
      effectiveThrough: "",
      status: "active",
    };
  }
  if (kind === "workpaper") {
    return {
      ...EMPTY_SOURCE,
      kind,
      registrationId: "",
      status: "draft",
      note: "",
      accrualLines: [createAccrualLineDraft(1)],
    };
  }
  if (kind === "filing") {
    return {
      ...EMPTY_SOURCE,
      kind,
      registrationId: "",
      filingReference: "",
      filedOn: "",
      status: "draft",
      currencyCode: "CNY",
      sourceReportedDeclaredAmount: "",
      sourceReportedPayableAmount: "",
      note: "",
    };
  }
  return {
    ...EMPTY_SOURCE,
    kind,
    paymentKind: "payment",
    paidOn: `${scope.year}-${String(scope.month).padStart(2, "0")}-01`,
    amount: "",
    currencyCode: "CNY",
    paymentReference: "",
    note: "",
    reversesPaymentId: "",
    idempotencyKey: createClientKey("tax-payment", scope),
    allocations: [createAllocationDraft()],
  };
}

export function createAccrualLineDraft(lineNo: number): AccrualLineDraft {
  return {
    ...EMPTY_SOURCE,
    key: createLocalKey("accrual"),
    lineNo: String(lineNo),
    recognitionOn: "",
    description: "",
    method: "base_rate",
    taxBaseAmount: "",
    taxRate: "",
    quantity: "",
    unitRate: "",
    divisor: "1",
    voucherItemId: "",
    voucherItemLabel: "",
    sourceReportedTaxAmount: "",
  };
}

export function createAllocationDraft(): AllocationDraft {
  return {
    ...EMPTY_SOURCE,
    key: createLocalKey("allocation"),
    filingId: "",
    voucherItemId: "",
    voucherItemLabel: "",
    allocatedAmount: "",
  };
}

export function editRegistrationDraft(row: RegistrationRow): RegistrationDraft {
  return {
    ...sourceDraft(row),
    kind: "registration",
    id: row.id,
    version: row.version,
    taxTypeId: String(row.taxTypeId),
    authorityPartyId: optionalString(row.authorityPartyId),
    authorityPartyName: row.authorityPartyName ?? "",
    registrationNo: row.registrationNo,
    jurisdiction: row.jurisdiction,
    filingFrequency: row.filingFrequency,
    effectiveFrom: dateOnly(row.effectiveFrom),
    effectiveThrough: dateOnly(row.effectiveThrough),
    status: row.status,
  };
}

export function editWorkpaperDraft(row: WorkpaperRow): WorkpaperDraft {
  return {
    ...sourceDraft(row),
    kind: "workpaper",
    id: row.id,
    version: row.version,
    registrationId: String(row.registrationId),
    status: row.status,
    note: row.note ?? "",
    accrualLines: row.accrualLines.map((line) => ({
      ...sourceDraft(line),
      key: `accrual-${line.id}`,
      id: line.id,
      lineNo: String(line.lineNo),
      recognitionOn: dateOnly(line.recognitionOn),
      description: line.description,
      method: line.method ?? (line.taxBaseAmount != null ? "base_rate" : "quantity_unit_rate"),
      taxBaseAmount: optionalString(line.taxBaseAmount),
      taxRate: optionalString(line.taxRate),
      quantity: optionalString(line.quantity),
      unitRate: optionalString(line.unitRate),
      divisor: optionalString(line.divisor),
      voucherItemId: optionalString(line.voucherItemId),
      voucherItemLabel: line.voucherItemLabel ?? "",
      sourceReportedTaxAmount: optionalString(line.sourceReportedTaxAmount),
    })),
  };
}

export function editFilingDraft(row: FilingRow): FilingDraft {
  return {
    ...sourceDraft(row),
    kind: "filing",
    id: row.id,
    version: row.version,
    registrationId: String(row.registrationId),
    filingReference: row.filingReference ?? "",
    filedOn: dateOnly(row.filedOn),
    status: row.status,
    currencyCode: row.currencyCode,
    sourceReportedDeclaredAmount: optionalString(row.sourceReportedDeclaredAmount),
    sourceReportedPayableAmount: optionalString(row.sourceReportedPayableAmount),
    note: row.note ?? "",
  };
}

export function buildTaxWriteInput(
  draft: TaxDraft,
  scope: { companyCode: string; year: number; month: number; periodId: number | null },
): TaxCreateInput | TaxUpdateInput {
  const trace = sourceInput(draft);
  if (draft.kind === "registration") {
    const shared = {
      ...trace,
      companyCode: scope.companyCode,
      taxTypeId: requiredNumber(draft.taxTypeId, "税种"),
      authorityPartyId: optionalNumber(draft.authorityPartyId),
      registrationNo: requiredText(draft.registrationNo, "登记号"),
      jurisdiction: requiredText(draft.jurisdiction, "税辖区"),
      filingFrequency: draft.filingFrequency,
      effectiveFrom: requiredText(draft.effectiveFrom, "生效日期"),
      effectiveThrough: optionalText(draft.effectiveThrough),
      status: draft.status,
    };
    return draft.id && draft.version
      ? { kind: "registration_update", id: draft.id, version: draft.version, ...shared }
      : { kind: "registration_create", ...shared };
  }
  if (draft.kind === "workpaper") {
    const periodId = requiredPeriod(scope.periodId);
    const shared = {
      ...trace,
      registrationId: requiredNumber(draft.registrationId, "纳税登记"),
      periodId,
      companyCode: scope.companyCode,
      year: scope.year,
      month: scope.month,
      status: draft.status,
      note: optionalText(draft.note),
      accrualLines: draft.accrualLines.map(toAccrualInput),
    };
    return draft.id && draft.version
      ? { kind: "workpaper_update", id: draft.id, version: draft.version, ...shared }
      : { kind: "workpaper_create", ...shared };
  }
  if (draft.kind === "filing") {
    const periodId = requiredPeriod(scope.periodId);
    const shared = {
      ...trace,
      registrationId: requiredNumber(draft.registrationId, "纳税登记"),
      periodId,
      companyCode: scope.companyCode,
      year: scope.year,
      month: scope.month,
      filingReference: optionalText(draft.filingReference),
      filedOn: optionalText(draft.filedOn),
      status: draft.status,
      currencyCode: requiredText(draft.currencyCode, "币种").toUpperCase(),
      sourceReportedDeclaredAmount: optionalNumber(draft.sourceReportedDeclaredAmount),
      sourceReportedPayableAmount: optionalNumber(draft.sourceReportedPayableAmount),
      note: optionalText(draft.note),
    };
    return draft.id && draft.version
      ? { kind: "filing_update", id: draft.id, version: draft.version, ...shared }
      : { kind: "filing_create", ...shared };
  }
  return {
    kind: "payment_append",
    ...trace,
    companyCode: scope.companyCode,
    paymentKind: draft.paymentKind,
    paidOn: requiredText(draft.paidOn, "支付日期"),
    amount: requiredNumber(draft.amount, "支付金额"),
    currencyCode: requiredText(draft.currencyCode, "币种").toUpperCase(),
    paymentReference: optionalText(draft.paymentReference),
    note: optionalText(draft.note),
    reversesPaymentId: optionalNumber(draft.reversesPaymentId),
    idempotencyKey: requiredText(draft.idempotencyKey, "幂等键"),
    allocations: draft.paymentKind === "reversal" ? [] : draft.allocations.map(toAllocationInput),
  };
}

export function registrationLabel(registrationId: number, workspace: TaxWorkspace | null) {
  const registration = workspace?.registrations.find((row) => row.id === registrationId);
  if (!registration) return "未识别纳税登记";
  return `${registration.taxType?.name ?? "税种"} · ${registration.registrationNo}`;
}

export function paymentAllocationTotal(draft: PaymentDraft) {
  return money(draft.allocations.reduce((sum, row) => sum + (optionalNumber(row.allocatedAmount) ?? 0), 0));
}

export function draftIsValid(draft: TaxDraft | null, periodId: number | null) {
  if (!draft) return false;
  if (draft.kind === "registration") {
    return Boolean(draft.taxTypeId && draft.registrationNo.trim() && draft.jurisdiction.trim() && draft.effectiveFrom);
  }
  if (draft.kind === "workpaper") {
    return Boolean(periodId != null && draft.registrationId && draft.accrualLines.length > 0
      && draft.accrualLines.every((line) => line.description.trim() && line.lineNo && (
        line.method === "base_rate"
          ? line.taxBaseAmount !== "" && line.taxRate !== ""
          : line.quantity !== "" && line.unitRate !== "" && line.divisor !== ""
      )));
  }
  if (draft.kind === "filing") {
    return Boolean(periodId != null && draft.registrationId && draft.currencyCode.trim() && (draft.status === "draft" || draft.filedOn));
  }
  const amount = optionalNumber(draft.amount);
  const allocated = paymentAllocationTotal(draft);
  return Boolean(draft.paidOn && draft.currencyCode.trim() && draft.idempotencyKey.trim()
    && amount != null && amount > 0
    && (draft.paymentKind === "reversal"
      ? draft.reversesPaymentId
      : draft.allocations.every((row) => row.filingId && (optionalNumber(row.allocatedAmount) ?? 0) > 0) && allocated <= amount));
}

function toAccrualInput(line: AccrualLineDraft): TaxAccrualLineInput {
  const baseRate = line.method === "base_rate";
  return {
    ...sourceInput(line),
    ...(line.id ? { id: line.id } : {}),
    lineNo: requiredNumber(line.lineNo, "行号"),
    recognitionOn: optionalText(line.recognitionOn),
    description: requiredText(line.description, "计税说明"),
    voucherItemId: optionalNumber(line.voucherItemId),
    taxBaseAmount: baseRate ? requiredNumber(line.taxBaseAmount, "计税基础") : null,
    taxRate: baseRate ? requiredNumber(line.taxRate, "税率") : null,
    quantity: baseRate ? null : requiredNumber(line.quantity, "数量"),
    unitRate: baseRate ? null : requiredNumber(line.unitRate, "单位税额"),
    divisor: baseRate ? null : requiredNumber(line.divisor, "除数"),
    sourceReportedTaxAmount: optionalNumber(line.sourceReportedTaxAmount),
  };
}

function toAllocationInput(row: AllocationDraft): TaxPaymentAllocationInput {
  return {
    ...sourceInput(row),
    filingId: requiredNumber(row.filingId, "申报记录"),
    voucherItemId: optionalNumber(row.voucherItemId),
    allocatedAmount: requiredNumber(row.allocatedAmount, "分配金额"),
  };
}

function sourceDraft(source: FinanceSourceTraceInput): SourceDraft {
  return {
    sourceKind: source.sourceKind ?? "manual",
    sourceReleaseId: source.sourceReleaseId ?? "",
    sourceFile: source.sourceFile ?? "",
    sourceKey: source.sourceKey ?? "",
  };
}

function sourceInput(source: SourceDraft): FinanceSourceTraceInput {
  return {
    sourceKind: optionalText(source.sourceKind),
    sourceReleaseId: optionalText(source.sourceReleaseId),
    sourceFile: optionalText(source.sourceFile),
    sourceKey: optionalText(source.sourceKey),
  };
}

function createClientKey(prefix: string, scope: { companyCode: string; year: number; month: number }) {
  return `${prefix}-${scope.companyCode}-${scope.year}-${String(scope.month).padStart(2, "0")}-${createLocalKey("manual")}`;
}

function createLocalKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requiredPeriod(value: number | null) {
  if (value == null || value <= 0) throw new Error("当前公司和年月不存在会计期间");
  return value;
}

function requiredNumber(value: string, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number) || number <= 0) throw new Error(`${label}无效`);
  return number;
}

function requiredText(value: string, label: string) {
  const text = value.trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value: string) {
  const text = value.trim();
  return text || null;
}

function optionalString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function dateOnly(value: unknown) {
  return optionalString(value).slice(0, 10);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
