import { prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceCloseBlockerDto,
  FinanceCloseProvider,
  FinanceCloseProviderInspection,
  FinanceCloseScope,
  FinanceCloseTaskStatus,
  FinanceCloseWorkpaperTaskKey,
} from "../../types/close";
import { financeCloseInspectionFingerprint } from "./inspection-identity";
import { inspectFinanceCloseWorkpaperEvidence, type FinanceCloseVoucherItemEvidenceFact } from "./workpaper-evidence";
import { financeCloseReviewEventMatchesWorkpaper, type ReviewedWorkpaperEventFact } from "./workpaper-event-snapshot";
import { stringArray } from "./workpaper-validation";

export type FinanceCloseWorkpaperFact = {
  id: number;
  companyId: number;
  periodId: number;
  taskKey: string;
  status: string;
  conclusion: string | null;
  evidenceRefs: unknown;
  voucherRefs: unknown;
  preparedByUserId: number | null;
  reviewedByUserId: number | null;
  version: number;
  updatedAt: Date;
};

type WorkpaperVoucherFact = {
  id: number;
  companyCode: string;
  status: string;
  period: { companyCode: string; year: number; month: number };
};

type WorkpaperReviewEventFact = ReviewedWorkpaperEventFact & { id: number; recordedAt: Date };

export type FinanceCloseWorkpaperProviderDependencies = {
  loadWorkpaper(scope: FinanceCloseScope, taskKey: FinanceCloseWorkpaperTaskKey): Promise<FinanceCloseWorkpaperFact | null>;
  loadWorkpaperVouchers(ids: number[]): Promise<WorkpaperVoucherFact[]>;
  loadWorkpaperVoucherItems(ids: number[]): Promise<FinanceCloseVoucherItemEvidenceFact[]>;
  loadLatestReviewedWorkpaperEvent(workpaperId: number): Promise<WorkpaperReviewEventFact | null>;
};

export type FinanceCloseFactInspection = {
  payload: unknown;
  blockers: FinanceCloseBlockerDto[];
  evidenceRefs: string[];
  voucherRefs: string[];
};

export const financeCloseWorkpaperProviderDependencies: FinanceCloseWorkpaperProviderDependencies = {
  loadWorkpaper: async (scope, taskKey) => {
    const [company, period] = await Promise.all([
      prisma.company.findUnique({ where: { code: scope.companyCode }, select: { id: true } }),
      prisma.financePeriod.findUnique({ where: { companyCode_year_month: scope }, select: { id: true } }),
    ]);
    if (!company || !period) return null;
    return prisma.financeCloseWorkpaper.findUnique({
      where: { companyId_periodId_taskKey: { companyId: company.id, periodId: period.id, taskKey } },
    });
  },
  loadWorkpaperVouchers: (ids) => ids.length === 0 ? Promise.resolve([]) : prisma.financeVoucher.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, companyCode: true, status: true,
      period: { select: { companyCode: true, year: true, month: true } },
    },
  }),
  loadWorkpaperVoucherItems: (ids) => ids.length === 0 ? Promise.resolve([]) : prisma.financeVoucherItem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      voucher: { select: {
        companyCode: true, status: true, periodId: true,
        period: { select: { companyCode: true, year: true, month: true } },
      } },
    },
  }),
  loadLatestReviewedWorkpaperEvent: (workpaperId) => prisma.financeCloseWorkpaperEvent.findFirst({
    where: { workpaperId, eventKind: "reviewed" },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, workpaperId: true, actorUserId: true, eventKind: true, toStatus: true,
      snapshot: true, recordedAt: true,
    },
  }),
};

export function buildFinanceCloseWorkpaperProvider(
  taskKey: FinanceCloseWorkpaperTaskKey,
  version: string,
  deps: FinanceCloseWorkpaperProviderDependencies,
  inspectFacts?: (scope: FinanceCloseScope) => Promise<FinanceCloseFactInspection>,
): FinanceCloseProvider {
  return { inspectPeriodClose: (scope) => inspectWorkpaper(scope, taskKey, version, deps, inspectFacts) };
}

async function inspectWorkpaper(
  scope: FinanceCloseScope,
  taskKey: FinanceCloseWorkpaperTaskKey,
  version: string,
  deps: FinanceCloseWorkpaperProviderDependencies,
  inspectFacts?: (scope: FinanceCloseScope) => Promise<FinanceCloseFactInspection>,
) {
  const [workpaper, facts] = await Promise.all([
    deps.loadWorkpaper(scope, taskKey),
    inspectFacts?.(scope) ?? Promise.resolve({ payload: null, blockers: [], evidenceRefs: [], voucherRefs: [] }),
  ]);
  const evidenceRefs = stringArray(workpaper?.evidenceRefs);
  const voucherRefs = stringArray(workpaper?.voucherRefs);
  const evidenceShapeValid = !workpaper || validStringArray(workpaper.evidenceRefs);
  const voucherIds = canonicalVoucherIds(workpaper?.voucherRefs, voucherRefs);
  const voucherShapeValid = voucherIds !== null;
  const resolvedVoucherIds = voucherIds ?? [];
  const [vouchers, evidence, reviewEvent] = await Promise.all([
    deps.loadWorkpaperVouchers(resolvedVoucherIds),
    inspectFinanceCloseWorkpaperEvidence(
      evidenceRefs,
      { ...scope, ...(workpaper ? { periodId: workpaper.periodId } : {}) },
      { findVoucherItems: deps.loadWorkpaperVoucherItems },
    ),
    workpaper?.status === "reviewed" ? deps.loadLatestReviewedWorkpaperEvent(workpaper.id) : Promise.resolve(null),
  ]);
  const voucherInspection = inspectWorkpaperVoucherRefs(resolvedVoucherIds, vouchers, scope);
  const staleVoucherIds = voucherInspection.staleIds;
  const link = workpaperLink(taskKey);
  const auditComplete = workpaper?.status !== "reviewed" || Boolean(
    workpaper.conclusion?.trim()
      && workpaper.preparedByUserId
      && workpaper.reviewedByUserId
      && workpaper.preparedByUserId !== workpaper.reviewedByUserId
      && evidenceRefs.length + voucherRefs.length > 0,
  );
  const reviewEventMatches = workpaper?.status !== "reviewed"
    || financeCloseReviewEventMatchesWorkpaper(workpaper, reviewEvent);
  const outputEvidenceRefs = canonicalReferences([...evidenceRefs, ...facts.evidenceRefs]);
  const outputVoucherRefs = canonicalReferences([...voucherRefs, ...facts.voucherRefs]);
  const blockers = [
    ...(workpaper?.status === "blocked" ? [blocker("workpaper_blocked", workpaper.conclusion?.trim() || "关账底稿已标记阻断", link)] : []),
    ...(!auditComplete ? [blocker("workpaper_review_audit_incomplete", "已复核底稿缺少结论、证据或独立编制复核记录", link)] : []),
    ...(!evidenceShapeValid || !voucherShapeValid || evidence.invalidRefs.length > 0
      ? [blocker("workpaper_reference_shape_invalid", "底稿含有无法验证的非规范证据或凭证引用", link)] : []),
    ...(evidence.staleInternalRefs.length > 0
      ? [blocker("workpaper_evidence_refs_stale", `${evidence.staleInternalRefs.length} 个凭证分录证据已失效`, link)] : []),
    ...(staleVoucherIds.length > 0
      ? [blocker("workpaper_voucher_refs_stale", `${staleVoucherIds.length} 个底稿凭证引用已失效`, link)] : []),
    ...(workpaper?.status === "reviewed" && !evidence.hasGovernedEvidence && resolvedVoucherIds.length === 0
      ? [blocker("workpaper_governed_evidence_missing", "已复核底稿没有可验证的受治理证据", link)] : []),
    ...(workpaper?.status === "reviewed" && !reviewEventMatches
      ? [blocker("workpaper_review_event_stale", "最新独立复核事件与当前底稿快照不一致", link)] : []),
  ];
  const payload = {
    scope,
    taskKey,
    workpaper: workpaper ? workpaperPayload(workpaper) : null,
    reviewEvent: reviewEvent ? { id: reviewEvent.id, recordedAt: reviewEvent.recordedAt.toISOString() } : null,
    decisions: { evidenceShapeValid, voucherShapeValid, auditComplete, reviewEventMatches },
    evidence,
    voucherInspection,
    outputReferences: { evidenceRefs: outputEvidenceRefs, voucherRefs: outputVoucherRefs },
    facts: {
      payload: facts.payload,
      blockers: facts.blockers,
      evidenceRefs: [...facts.evidenceRefs].sort(),
      voucherRefs: [...facts.voucherRefs].sort(),
    },
  };
  const status: FinanceCloseTaskStatus = blockers.length + facts.blockers.length > 0
    ? "blocked"
    : workpaper?.status === "reviewed" ? "ready" : "pending";
  return inspection(
    status, version, link, payload, [...blockers, ...facts.blockers],
    outputEvidenceRefs,
    outputVoucherRefs,
  );
}

function canonicalVoucherIds(raw: unknown, refs: string[]) {
  if (raw !== undefined && (!Array.isArray(raw) || !raw.every((ref) => typeof ref === "string"))) return null;
  if (refs.some((ref) => !/^finance-voucher:[1-9]\d*$/u.test(ref))) return null;
  const ids = refs.map((ref) => Number(ref.slice("finance-voucher:".length)));
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? [...new Set(ids)] : null;
}

function inspectWorkpaperVoucherRefs(ids: number[], facts: WorkpaperVoucherFact[], scope: FinanceCloseScope) {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const requestedIds = [...ids].sort((left, right) => left - right);
  const decisions = requestedIds.map((id) => {
    const fact = byId.get(id);
    const companyMatches = Boolean(fact
      && fact.companyCode === scope.companyCode
      && fact.period.companyCode === scope.companyCode);
    const periodMatches = Boolean(fact
      && fact.period.year === scope.year
      && fact.period.month === scope.month);
    const valid = Boolean(fact && companyMatches && periodMatches && fact.status === "posted");
    return {
      id,
      present: Boolean(fact),
      companyCode: fact?.companyCode ?? null,
      companyMatches,
      status: fact?.status ?? null,
      period: fact ? fact.period : null,
      periodMatches,
      valid,
    };
  });
  return { requestedIds, decisions, staleIds: decisions.filter((item) => !item.valid).map((item) => item.id) };
}

function validStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && Boolean(item.trim()));
}

function canonicalReferences(values: string[]) {
  return [...new Set(values)].sort();
}

function workpaperPayload(workpaper: FinanceCloseWorkpaperFact) {
  return {
    id: workpaper.id, companyId: workpaper.companyId, periodId: workpaper.periodId,
    status: workpaper.status, conclusion: workpaper.conclusion,
    preparedByUserId: workpaper.preparedByUserId, reviewedByUserId: workpaper.reviewedByUserId,
    version: workpaper.version, updatedAt: workpaper.updatedAt.toISOString(),
  };
}

function inspection(
  status: FinanceCloseTaskStatus,
  contributorVersion: string,
  deepLink: string,
  payload: unknown,
  blockers: FinanceCloseBlockerDto[],
  evidenceRefs: string[],
  voucherRefs: string[],
): FinanceCloseProviderInspection {
  return {
    status, contributorVersion,
    inputFingerprint: financeCloseInspectionFingerprint({ status, blockers, evidenceRefs, voucherRefs, deepLink, payload }),
    blockers, evidenceRefs, voucherRefs, deepLink, payload,
  };
}

function blocker(code: string, message: string, deepLink: string): FinanceCloseBlockerDto {
  return { code, message, deepLink };
}

function workpaperLink(taskKey: string) {
  return `/finance/ledger?tab=closing&taskKey=${encodeURIComponent(taskKey)}`;
}
