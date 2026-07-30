import { prisma } from "@workspace/platform/server/prisma";

import type { FinanceSourceTraceInput, TaxBlockerDto, TaxCreateInput, TaxScope, TaxUpdateInput, TaxWorkspaceDto } from "../../types/tax";
import {
  calculateTaxPaidByFilingAsOf,
  calculateTaxPaymentAllocation,
  calculateTaxWorkpaper,
} from "./calculations";
import {
  type TaxCreateCommand,
  type TaxUpdateCommand,
} from "./validation";
import {
  validateTaxCreatePersistenceCommand,
  validateTaxUpdatePersistenceCommand,
} from "../domain/tax-validation";
import { taxRegistrationPeriodScope } from "./registration-period-scope";
import { taxValidationDependencies } from "./reference-adapter";

const sourceKeys = [
  "sourceKind",
  "sourceReleaseId",
  "sourceSha256",
  "sourceFile",
  "sourceSheet",
  "sourceRow",
  "sourceRange",
  "sourceKey",
] as const;

function sourceData(input: FinanceSourceTraceInput) {
  return Object.fromEntries(sourceKeys.map((key) => [key, input[key] ?? null]));
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function registrationData(input: Extract<TaxCreateInput | TaxUpdateInput, { kind: "registration_create" | "registration_update" }>, companyId: number) {
  return {
    companyId,
    taxTypeId: input.taxTypeId,
    authorityPartyId: input.authorityPartyId ?? null,
    registrationNo: input.registrationNo,
    jurisdiction: input.jurisdiction,
    filingFrequency: input.filingFrequency,
    effectiveFrom: parseDate(input.effectiveFrom)!,
    effectiveThrough: parseDate(input.effectiveThrough),
    status: input.status,
    ...sourceData(input),
  };
}

function workpaperData(input: Extract<TaxCreateInput | TaxUpdateInput, { kind: "workpaper_create" | "workpaper_update" }>, calculation: NonNullable<TaxCreateCommand["calculation"]>) {
  return {
    registrationId: input.registrationId,
    periodId: input.periodId,
    status: input.status,
    calculationVersion: calculation.calculationVersion,
    inputFingerprint: calculation.inputFingerprint,
    note: input.note ?? null,
    ...sourceData(input),
  };
}

function accrualLineData(input: Extract<TaxCreateInput | TaxUpdateInput, { kind: "workpaper_create" | "workpaper_update" }>["accrualLines"][number]) {
  return {
    voucherItemId: input.voucherItemId ?? null,
    lineNo: input.lineNo,
    recognitionOn: parseDate(input.recognitionOn),
    description: input.description,
    taxBaseAmount: input.taxBaseAmount ?? null,
    taxRate: input.taxRate ?? null,
    quantity: input.quantity ?? null,
    unitRate: input.unitRate ?? null,
    divisor: input.divisor ?? null,
    sourceReportedTaxAmount: input.sourceReportedTaxAmount ?? null,
    ...sourceData(input),
  };
}

function filingData(input: Extract<TaxCreateInput | TaxUpdateInput, { kind: "filing_create" | "filing_update" }>) {
  return {
    registrationId: input.registrationId,
    periodId: input.periodId,
    filingReference: input.filingReference ?? null,
    filedOn: parseDate(input.filedOn),
    status: input.status,
    currencyCode: input.currencyCode,
    sourceReportedDeclaredAmount: input.sourceReportedDeclaredAmount ?? null,
    sourceReportedPayableAmount: input.sourceReportedPayableAmount ?? null,
    note: input.note ?? null,
    ...sourceData(input),
  };
}

function paymentData(input: Extract<TaxCreateInput, { kind: "payment_append" }>, companyId: number) {
  return {
    companyId,
    paymentKind: input.paymentKind,
    paidOn: parseDate(input.paidOn)!,
    amount: input.amount,
    currencyCode: input.currencyCode,
    paymentReference: input.paymentReference ?? null,
    note: input.note ?? null,
    reversesPaymentId: input.reversesPaymentId ?? null,
    idempotencyKey: input.idempotencyKey,
    ...sourceData(input),
  };
}

function allocationData(input: Extract<TaxCreateInput, { kind: "payment_append" }>["allocations"][number]) {
  return {
    filingId: input.filingId,
    voucherItemId: input.voucherItemId ?? null,
    allocatedAmount: input.allocatedAmount,
    ...sourceData(input),
  };
}

export function serializeTaxValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeTaxValue);
  if (value && typeof value === "object") {
    const candidate = value as { toNumber?: () => number; constructor?: { name?: string } };
    if (candidate.constructor?.name === "Decimal" && typeof candidate.toNumber === "function") return candidate.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeTaxValue(item)]));
  }
  return value;
}

async function createRegistration(input: Extract<TaxCreateInput, { kind: "registration_create" }>, companyId: number) {
  return prisma.financeTaxRegistration.create({ data: registrationData(input, companyId) });
}

async function createWorkpaper(input: Extract<TaxCreateInput, { kind: "workpaper_create" }>, calculation: NonNullable<TaxCreateCommand["calculation"]>) {
  return prisma.financeTaxWorkpaper.create({
    data: {
      ...workpaperData(input, calculation),
      accrualLines: { create: input.accrualLines.map(accrualLineData) },
    },
    include: { accrualLines: { orderBy: { lineNo: "asc" } } },
  });
}

async function createFiling(input: Extract<TaxCreateInput, { kind: "filing_create" }>) {
  return prisma.financeTaxFiling.create({ data: filingData(input) });
}

async function appendPayment(input: Extract<TaxCreateInput, { kind: "payment_append" }>, companyId: number) {
  return prisma.financeTaxPayment.create({
    data: {
      ...paymentData(input, companyId),
      allocations: { create: input.allocations.map(allocationData) },
    },
    include: { allocations: { orderBy: { id: "asc" } } },
  });
}

export async function executeTaxCreate(command: TaxCreateCommand) {
  const checked = await validateTaxCreatePersistenceCommand(command, taxValidationDependencies);
  if (!checked.ok) throw new Error(checked.issue.message);
  command = checked.data;
  if (command.idempotentRecordId) {
    const existing = await prisma.financeTaxPayment.findUniqueOrThrow({
      where: { id: command.idempotentRecordId },
      include: { allocations: { orderBy: { id: "asc" } } },
    });
    return { kind: command.input.kind, record: serializeTaxValue(existing), idempotent: true };
  }
  const record = command.input.kind === "registration_create"
    ? await createRegistration(command.input, command.companyId!)
    : command.input.kind === "workpaper_create"
      ? await createWorkpaper(command.input, command.calculation!)
      : command.input.kind === "filing_create"
        ? await createFiling(command.input)
        : await appendPayment(command.input, command.companyId!);
  return { kind: command.input.kind, record: serializeTaxValue(record), idempotent: false };
}

async function updateRegistration(input: Extract<TaxUpdateInput, { kind: "registration_update" }>, companyId: number) {
  const updated = await prisma.financeTaxRegistration.updateMany({
    where: { id: input.id, company: { code: input.companyCode }, version: input.version },
    data: { ...registrationData(input, companyId), version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new Error("纳税登记已被其他人修改，请刷新后重试");
  return prisma.financeTaxRegistration.findUniqueOrThrow({ where: { id: input.id } });
}

async function updateWorkpaper(input: Extract<TaxUpdateInput, { kind: "workpaper_update" }>, calculation: NonNullable<TaxUpdateCommand["calculation"]>) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.financeTaxWorkpaper.updateMany({
      where: { id: input.id, registration: { company: { code: input.companyCode } }, version: input.version },
      data: { ...workpaperData(input, calculation), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("计税底稿已被其他人修改，请刷新后重试");
    for (const line of input.accrualLines) {
      const data = accrualLineData(line);
      if (line.id) {
        const lineUpdate = await tx.financeTaxAccrualLine.updateMany({ where: { id: line.id, workpaperId: input.id }, data });
        if (lineUpdate.count !== 1) throw new Error("计税明细不存在或不属于当前工作底稿");
      } else {
        await tx.financeTaxAccrualLine.upsert({
          where: { workpaperId_lineNo: { workpaperId: input.id, lineNo: line.lineNo } },
          create: { workpaperId: input.id, ...data },
          update: data,
        });
      }
    }
    return tx.financeTaxWorkpaper.findUniqueOrThrow({
      where: { id: input.id },
      include: { accrualLines: { orderBy: { lineNo: "asc" } } },
    });
  });
}

async function updateFiling(input: Extract<TaxUpdateInput, { kind: "filing_update" }>) {
  const updated = await prisma.financeTaxFiling.updateMany({
    where: { id: input.id, registration: { company: { code: input.companyCode } }, version: input.version },
    data: { ...filingData(input), version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new Error("税务申报已被其他人修改，请刷新后重试");
  return prisma.financeTaxFiling.findUniqueOrThrow({ where: { id: input.id } });
}

export async function executeTaxUpdate(command: TaxUpdateCommand) {
  const checked = await validateTaxUpdatePersistenceCommand(command, taxValidationDependencies);
  if (!checked.ok) throw new Error(checked.issue.message);
  command = checked.data;
  const record = command.input.kind === "registration_update"
    ? await updateRegistration(command.input, command.companyId!)
    : command.input.kind === "workpaper_update"
      ? await updateWorkpaper(command.input, command.calculation!)
      : await updateFiling(command.input);
  return { kind: command.input.kind, record: serializeTaxValue(record) };
}

function monthBounds(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

function sourceEvidence(row: Record<string, unknown>) {
  const release = typeof row.sourceReleaseId === "string" ? row.sourceReleaseId : null;
  const key = typeof row.sourceKey === "string" ? row.sourceKey : null;
  const file = typeof row.sourceFile === "string" ? row.sourceFile : null;
  return [release, file, key].filter(Boolean).join(":") || null;
}

function hasSourceEvidence(row: Record<string, unknown>) {
  return Boolean(sourceEvidence(row));
}

function voucherItemLabel(item: null | {
  description: string | null;
  account: { code: string; name: string };
  voucher: { voucherNo: string; date: string };
}) {
  return item
    ? `${item.voucher.voucherNo} · ${item.account.code} ${item.account.name}${item.description ? ` · ${item.description}` : ""}`
    : null;
}

export function taxScopeDeepLink(scope: TaxScope) {
  return `/finance/tax?companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;
}

export function missingTaxPeriodBlocker(scope: TaxScope): TaxBlockerDto {
  return {
    code: "missing_period",
    message: "当前公司和年月不存在会计期间",
    entityKind: "scope",
    entityId: null,
    deepLink: taxScopeDeepLink(scope),
  };
}

export async function listTaxWorkspace(scope: { companyCode: string; year: number; month: number }): Promise<TaxWorkspaceDto> {
  const period = await prisma.financePeriod.findUnique({
    where: { companyCode_year_month: scope },
    select: { id: true, isClosed: true },
  });
  const periodId = period?.id ?? null;
  const bounds = monthBounds(scope.year, scope.month);
  const registrations = await prisma.financeTaxRegistration.findMany({
    where: { company: { code: scope.companyCode } },
    include: { taxType: true, authorityParty: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { registrationNo: "asc" }],
  });
  const taxTypes = await prisma.financeTaxType.findMany({ where: { isActive: true }, orderBy: [{ jurisdiction: "asc" }, { code: "asc" }] });
  const workpapers = periodId ? await prisma.financeTaxWorkpaper.findMany({
    where: { periodId, registration: { company: { code: scope.companyCode } } },
    include: {
      accrualLines: {
        include: {
          voucherItem: {
            select: {
              description: true,
              account: { select: { code: true, name: true } },
              voucher: { select: { voucherNo: true, date: true } },
            },
          },
        },
        orderBy: { lineNo: "asc" },
      },
    },
    orderBy: { id: "asc" },
  }) : [];
  const filings = periodId ? await prisma.financeTaxFiling.findMany({
    where: { periodId, registration: { company: { code: scope.companyCode } } },
    orderBy: { id: "asc" },
  }) : [];
  const payments = await prisma.financeTaxPayment.findMany({
    where: {
      company: { code: scope.companyCode },
      paidOn: { lt: bounds.end },
      OR: [
        { paidOn: { gte: bounds.start, lt: bounds.end } },
        ...(periodId ? [{ allocations: { some: { filing: { periodId } } } }] : []),
        ...(periodId ? [{ reversesPayment: { is: { allocations: { some: { filing: { periodId } } } } } }] : []),
      ],
    },
    include: {
      allocations: {
        include: {
          filing: { select: { registrationId: true, periodId: true } },
          voucherItem: {
            select: {
              description: true,
              account: { select: { code: true, name: true } },
              voucher: { select: { voucherNo: true, date: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ paidOn: "asc" }, { id: "asc" }],
  });
  const snapshots = periodId ? await prisma.financeTaxReconciliationSnapshot.findMany({
    where: { periodId, registration: { company: { code: scope.companyCode } } },
    orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
  }) : [];

  const workpaperDtos = workpapers.map((workpaper) => {
    const calculated = calculateTaxWorkpaper(workpaper.accrualLines.map((line) => ({
      taxBaseAmount: line.taxBaseAmount == null ? null : Number(line.taxBaseAmount),
      taxRate: line.taxRate == null ? null : Number(line.taxRate),
      quantity: line.quantity == null ? null : Number(line.quantity),
      unitRate: line.unitRate == null ? null : Number(line.unitRate),
      divisor: line.divisor == null ? null : Number(line.divisor),
      sourceReportedTaxAmount: line.sourceReportedTaxAmount == null ? null : Number(line.sourceReportedTaxAmount),
    })));
    return serializeTaxValue({
      ...workpaper,
      accrualLines: workpaper.accrualLines.map((line, index) => ({
        ...line,
        voucherItemLabel: voucherItemLabel(line.voucherItem),
        ...calculated.lines[index],
      })),
      calculatedAmount: calculated.calculatedAmount,
      sourceReportedAmount: calculated.sourceReportedAmount,
      sourceDifference: calculated.sourceDifference,
    }) as Record<string, unknown>;
  });
  const workpaperByRegistration = new Map(workpaperDtos.map((row) => [Number(row.registrationId), row]));
  const paymentAsOf = calculateTaxPaidByFilingAsOf(payments, bounds.endDate);
  const filingDtos = filings.map((filing) => {
    const workpaper = workpaperByRegistration.get(filing.registrationId);
    const calculatedAmount = typeof workpaper?.calculatedAmount === "number" ? workpaper.calculatedAmount : null;
    const declaredAmount = filing.sourceReportedDeclaredAmount == null ? null : Number(filing.sourceReportedDeclaredAmount);
    const payableAmount = filing.sourceReportedPayableAmount == null ? null : Number(filing.sourceReportedPayableAmount);
    const paidAmount = Math.round(((paymentAsOf.paidByFiling.get(filing.id) ?? 0) + Number.EPSILON) * 100) / 100;
    const contributingPayments = payments.filter((payment) => paymentAsOf.effectivePaymentIds.has(payment.id)
      && payment.allocations.some((allocation) => allocation.filingId === filing.id));
    const filingEvidenceComplete = Boolean(filing.filingReference)
      || hasSourceEvidence(filing as unknown as Record<string, unknown>);
    const paymentEvidenceComplete = payableAmount != null && Math.abs(payableAmount) <= 0.01
      ? true
      : contributingPayments.length > 0 && contributingPayments.every((payment) => (
        (Boolean(payment.paymentReference) || hasSourceEvidence(payment as unknown as Record<string, unknown>))
        && payment.allocations.filter((allocation) => allocation.filingId === filing.id)
          .every((allocation) => allocation.voucherItemId != null)
      ));
    const difference = (left: number | null, right: number | null) => left == null || right == null
      ? null
      : Math.round((left - right + Number.EPSILON) * 100) / 100;
    return serializeTaxValue({
      ...filing,
      reconciliation: {
        calculatedAmount,
        declaredAmount,
        payableAmount,
        paidAmount,
        asOfDate: bounds.endDate,
        filingEvidenceComplete,
        paymentEvidenceComplete,
        effectivePaymentIds: contributingPayments.map((payment) => payment.id).sort((left, right) => left - right),
        calculatedToDeclaredDifference: difference(calculatedAmount, declaredAmount),
        declaredToPayableDifference: difference(declaredAmount, payableAmount),
        payableToPaidDifference: payableAmount == null ? null : difference(payableAmount, paidAmount),
      },
    }) as Record<string, unknown>;
  });
  const paymentDtos = payments.map((payment) => serializeTaxValue({
    ...payment,
    allocations: payment.allocations.map((allocation) => ({
      ...allocation,
      voucherItemLabel: voucherItemLabel(allocation.voucherItem),
    })),
    ...calculateTaxPaymentAllocation(Number(payment.amount), payment.allocations.map((allocation) => ({ allocatedAmount: Number(allocation.allocatedAmount) }))),
  }) as Record<string, unknown>);
  const registrationDtos = registrations.map((registration) => serializeTaxValue(registration) as Record<string, unknown>);
  const taxTypeDtos = taxTypes.map((taxType) => serializeTaxValue(taxType) as Record<string, unknown>);
  const snapshotDtos = snapshots.map((snapshot) => serializeTaxValue(snapshot) as Record<string, unknown>);

  const blockers: TaxWorkspaceDto["blockers"] = [];
  const deepLink = taxScopeDeepLink(scope);
  if (!period) {
    blockers.push(missingTaxPeriodBlocker(scope));
  }
  const scopedRegistrations = registrations.map((registration) => ({
    registration,
    scope: taxRegistrationPeriodScope(registration, scope),
  })).filter((item) => item.scope.inScope);
  const filingByRegistration = new Map(filingDtos.map((row) => [Number(row.registrationId), row]));
  for (const { registration, scope: registrationScope } of scopedRegistrations) {
    const workpaper = workpaperByRegistration.get(registration.id);
    const filing = filingByRegistration.get(registration.id);
    if (registrationScope.blockerCode === "registration_suspended_scope_unproven") {
      blockers.push({ code: registrationScope.blockerCode, message: "纳税登记已暂停但缺少暂停生效日，无法证明目标期间不应申报", entityKind: "registration", entityId: registration.id, deepLink });
    }
    if (registrationScope.blockerCode === "registration_end_date_missing") {
      blockers.push({ code: registrationScope.blockerCode, message: "已终止的纳税登记缺少失效日，无法确定目标期间申报义务", entityKind: "registration", entityId: registration.id, deepLink });
    }
    if (!workpaper) blockers.push({ code: "missing_workpaper", message: "当前期间缺少计税底稿", entityKind: "registration", entityId: registration.id, deepLink });
    if (workpaper?.status === "blocked") blockers.push({ code: "workpaper_blocked", message: "计税底稿处于 blocked 状态", entityKind: "workpaper", entityId: Number(workpaper.id), deepLink });
    if (typeof workpaper?.sourceDifference === "number" && Math.abs(workpaper.sourceDifference) > 0.01) blockers.push({ code: "workpaper_source_difference", message: "计税底稿与来源金额存在差异", entityKind: "workpaper", entityId: Number(workpaper.id), deepLink });
    if (!filing) {
      blockers.push({ code: "missing_filing", message: "当前期间缺少税务申报记录", entityKind: "registration", entityId: registration.id, deepLink });
      continue;
    }
    const reconciliation = filing.reconciliation as Record<string, unknown>;
    if (!["filed", "accepted", "amended"].includes(String(filing.status))) {
      blockers.push({ code: "filing_not_submitted", message: "税务申报尚未正式申报或受理", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
    if (reconciliation.declaredAmount == null || reconciliation.payableAmount == null) {
      blockers.push({ code: "filing_amounts_missing", message: "申报金额或应缴金额缺少明确证据", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
    if (reconciliation.filingEvidenceComplete !== true) {
      blockers.push({ code: "filing_evidence_missing", message: "缺少申报回执或可追溯来源证据", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
    if (reconciliation.paymentEvidenceComplete !== true) {
      blockers.push({ code: "payment_evidence_missing", message: "缺少期末前生效的缴款回单或总账凭证勾稽", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
    if (["calculatedToDeclaredDifference", "declaredToPayableDifference"].some((key) => (
      typeof reconciliation[key] === "number" && Math.abs(reconciliation[key] as number) > 0.01
    ))) {
      blockers.push({ code: "filing_reconciliation_difference", message: "计税、申报与应缴金额存在差异", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
    if (typeof reconciliation.payableToPaidDifference === "number" && Math.abs(reconciliation.payableToPaidDifference) > 0.01) {
      blockers.push({ code: "filing_payment_difference", message: "申报应缴与已支付金额存在差异", entityKind: "filing", entityId: Number(filing.id), deepLink });
    }
  }
  const evidenceRefs = [...new Set(
    [...registrationDtos, ...workpaperDtos, ...filingDtos, ...paymentDtos]
      .map(sourceEvidence)
      .filter((value): value is string => Boolean(value)),
  )];
  return {
    scope: { ...scope, periodId, isClosed: period?.isClosed ?? false },
    taxTypes: taxTypeDtos,
    registrations: registrationDtos,
    workpapers: workpaperDtos,
    filings: filingDtos,
    payments: paymentDtos,
    reconciliationSnapshots: snapshotDtos,
    blockers,
    evidenceRefs,
  };
}
