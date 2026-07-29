import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import type {
  FinanceCloseScope,
  FinanceCloseWorkpaperTaskKey,
  ReviewFinanceCloseWorkpaperInput,
  SaveFinanceCloseWorkpaperInput,
} from "../../types/close";
import { financeCloseWorkpaperReviewIdempotencyKey } from "../../types/close";
import { sha256CanonicalJson } from "./canonical-json";
import {
  inspectFinanceCloseWorkpaperEvidence,
  type FinanceCloseVoucherItemEvidenceFact,
} from "./workpaper-evidence";

type ScopeFact = FinanceCloseScope & { companyId: number; periodId: number; isPeriodClosed: boolean };
type WorkpaperFact = {
  id: number;
  companyId: number;
  periodId: number;
  taskKey: string;
  status: string;
  conclusion: string | null;
  evidenceRefs: unknown;
  voucherRefs: unknown;
  preparedByUserId: number | null;
  version: number;
};
type EventFact = { workpaperId: number; eventKind: string; requestFingerprint: string };
type VoucherFact = { id: number; companyCode: string; periodId: number; status: string };

export type FinanceCloseWorkpaperValidationDependencies = {
  resolveScope(scope: FinanceCloseScope): Promise<ScopeFact | null>;
  userCanLogin(userId: number): Promise<boolean>;
  findWorkpaper(scope: ScopeFact, taskKey: FinanceCloseWorkpaperTaskKey): Promise<WorkpaperFact | null>;
  findEvent(idempotencyKey: string): Promise<EventFact | null>;
  findVouchers(ids: number[]): Promise<VoucherFact[]>;
  findVoucherItems(ids: number[]): Promise<FinanceCloseVoucherItemEvidenceFact[]>;
};

export type SaveFinanceCloseWorkpaperCommand = ScopeFact & {
  input: SaveFinanceCloseWorkpaperInput;
  actorUserId: number;
  requestFingerprint: string;
  existing: WorkpaperFact | null;
  idempotentWorkpaperId: number | null;
};

export type ReviewFinanceCloseWorkpaperCommand = ScopeFact & {
  input: ReviewFinanceCloseWorkpaperInput;
  actorUserId: number;
  requestFingerprint: string;
  existing: WorkpaperFact;
  idempotentWorkpaperId: number | null;
};

function uniqueTrimmed(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function voucherIds(values: string[]) {
  return values.map((value) => Number(value.slice("finance-voucher:".length)));
}

async function validateVouchers(
  refs: string[],
  scope: ScopeFact,
  deps: FinanceCloseWorkpaperValidationDependencies,
) {
  if (refs.some((value) => !/^finance-voucher:[1-9]\d*$/.test(value))) {
    return failCommand("凭证引用必须使用 finance-voucher:<id> 格式", 400, "voucherRefs");
  }
  const ids = voucherIds(refs);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return failCommand("凭证引用 id 必须是正安全整数", 400, "voucherRefs");
  const vouchers = await deps.findVouchers(ids);
  if (vouchers.length !== ids.length || vouchers.some((voucher) => (
    voucher.companyCode !== scope.companyCode || voucher.periodId !== scope.periodId || voucher.status !== "posted"
  ))) {
    return failCommand("凭证不存在、仍为草稿或不属于当前公司及期间", 400, "voucherRefs");
  }
  return okCommand(vouchers);
}

async function validateEvidenceRefs(
  refs: string[],
  scope: ScopeFact,
  deps: FinanceCloseWorkpaperValidationDependencies,
) {
  const inspected = await inspectFinanceCloseWorkpaperEvidence(refs, scope, deps);
  if (inspected.invalidRefs.length > 0) {
    return failCommand("证据引用不受支持；请使用同期间凭证分录或带 SHA-256 的 HTTPS 来源", 400, "evidenceRefs");
  }
  if (inspected.staleInternalRefs.length > 0) {
    return failCommand("凭证分录证据不存在、未过账或不属于当前公司及期间", 400, "evidenceRefs");
  }
  return okCommand(inspected);
}

async function resolveActorScope(
  input: FinanceCloseScope,
  actorUserId: number,
  deps: FinanceCloseWorkpaperValidationDependencies,
) {
  if (!await deps.userCanLogin(actorUserId)) return failCommand("当前用户不存在或不可登录", 403);
  const scope = await deps.resolveScope(input);
  if (!scope) return failCommand("公司或会计期间不存在", 400, "month");
  return okCommand(scope);
}

export async function buildSaveFinanceCloseWorkpaperCommand(
  raw: SaveFinanceCloseWorkpaperInput,
  actorUserId: number,
  deps: FinanceCloseWorkpaperValidationDependencies,
) {
  const scope = await resolveActorScope(raw, actorUserId, deps);
  if (!scope.ok) return scope;
  const input = {
    ...raw,
    conclusion: raw.conclusion?.trim() || null,
    evidenceRefs: uniqueTrimmed(raw.evidenceRefs),
    voucherRefs: uniqueTrimmed(raw.voucherRefs),
  };
  const requestFingerprint = sha256CanonicalJson({ kind: "finance_close_workpaper_save", input, actorUserId });
  const event = await deps.findEvent(input.idempotencyKey);
  if (event) {
    if (event.eventKind !== "saved" || event.requestFingerprint !== requestFingerprint) {
      return failCommand("幂等键已用于不同的关账底稿命令", 409, "idempotencyKey");
    }
    return okCommand<SaveFinanceCloseWorkpaperCommand>({
      ...scope.data, input, actorUserId, requestFingerprint, existing: null,
      idempotentWorkpaperId: event.workpaperId,
    });
  }
  if (scope.data.isPeriodClosed) return failCommand("会计期间已关闭，不能修改关账底稿", 409, "month");
  if (input.status !== "draft" && !input.conclusion) return failCommand("提交或阻断底稿必须填写结论", 400, "conclusion");
  const evidence = await validateEvidenceRefs(input.evidenceRefs, scope.data, deps);
  if (!evidence.ok) return evidence;
  const vouchers = await validateVouchers(input.voucherRefs, scope.data, deps);
  if (!vouchers.ok) return vouchers;
  if (input.status === "prepared" && !evidence.data.hasGovernedEvidence && vouchers.data.length === 0) {
    return failCommand("提交复核前必须提供可验证的同期间凭证、凭证分录或带 SHA-256 的外部证据", 400, "evidenceRefs");
  }
  const existing = await deps.findWorkpaper(scope.data, input.taskKey);
  if (!existing && input.expectedVersion !== null) return failCommand("底稿尚不存在，expectedVersion 必须为空", 409, "expectedVersion");
  if (existing && input.expectedVersion !== existing.version) return failCommand("关账底稿版本已变化，请刷新后重试", 409, "expectedVersion");
  return okCommand<SaveFinanceCloseWorkpaperCommand>({
    ...scope.data, input, actorUserId, requestFingerprint, existing,
    idempotentWorkpaperId: null,
  });
}

export async function buildReviewFinanceCloseWorkpaperCommand(
  input: ReviewFinanceCloseWorkpaperInput,
  actorUserId: number,
  deps: FinanceCloseWorkpaperValidationDependencies,
) {
  const scope = await resolveActorScope(input, actorUserId, deps);
  if (!scope.ok) return scope;
  const existing = await deps.findWorkpaper(scope.data, input.taskKey);
  if (!existing) return failCommand("关账底稿不存在", 404, "taskKey");
  const authoritativeIdempotencyKey = financeCloseWorkpaperReviewIdempotencyKey(existing.id, input.expectedVersion, actorUserId);
  if (input.idempotencyKey !== authoritativeIdempotencyKey) {
    return failCommand("复核幂等键未绑定当前底稿、版本和复核人", 400, "idempotencyKey");
  }
  const requestFingerprint = sha256CanonicalJson({ kind: "finance_close_workpaper_review", input, actorUserId });
  const event = await deps.findEvent(input.idempotencyKey);
  if (event) {
    if (event.workpaperId !== existing.id || event.eventKind !== "reviewed" || event.requestFingerprint !== requestFingerprint) {
      return failCommand("幂等键已用于不同的关账底稿命令", 409, "idempotencyKey");
    }
    return okCommand<ReviewFinanceCloseWorkpaperCommand>({
      ...scope.data, input, actorUserId, requestFingerprint,
      existing: null as never, idempotentWorkpaperId: event.workpaperId,
    });
  }
  if (scope.data.isPeriodClosed) return failCommand("会计期间已关闭，不能复核关账底稿", 409, "month");
  if (existing.version !== input.expectedVersion) return failCommand("关账底稿版本已变化，请刷新后重试", 409, "expectedVersion");
  if (existing.status !== "prepared") return failCommand("只有已提交复核的底稿可以完成独立复核", 409, "taskKey");
  if (existing.preparedByUserId === actorUserId) return failCommand("复核人不能与编制人相同", 409, "taskKey");
  if (!existing.conclusion?.trim()) {
    return failCommand("底稿缺少结论或证据，不能完成复核", 409, "taskKey");
  }
  const evidence = await validateEvidenceRefs(stringArray(existing.evidenceRefs), scope.data, deps);
  if (!evidence.ok) return evidence;
  const vouchers = await validateVouchers(stringArray(existing.voucherRefs), scope.data, deps);
  if (!vouchers.ok) return vouchers;
  if (!evidence.data.hasGovernedEvidence && vouchers.data.length === 0) {
    return failCommand("底稿没有可验证的受治理证据，不能完成复核", 409, "evidenceRefs");
  }
  return okCommand<ReviewFinanceCloseWorkpaperCommand>({
    ...scope.data, input, actorUserId, requestFingerprint, existing,
    idempotentWorkpaperId: null,
  });
}

export function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
