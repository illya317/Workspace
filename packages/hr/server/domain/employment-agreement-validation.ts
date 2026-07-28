import {
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
  type BusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  EMPLOYMENT_AGREEMENT_COMMAND_KINDS,
  EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS,
  employmentAgreementFieldLabel,
  type EmploymentAgreementCommandKind,
} from "@workspace/hr/employment-agreement-field-contract";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "../../business-temporal";
import { isValidCompanyName, validateContractOption } from "../field-validation";

export { EMPLOYMENT_AGREEMENT_COMMAND_KINDS };
export type { EmploymentAgreementCommandKind };

export interface EmploymentAgreementContent {
  company: string | null;
  insuranceStatus: string | null;
  legalRelation: string | null;
  contractType: string | null;
  employmentForm: string | null;
  confidentialityDate: BusinessDate | null;
  nonCompeteDate: BusinessDate | null;
}

export type EmploymentAgreementContentPatch = Partial<EmploymentAgreementContent>;
export type EmploymentAgreementTermPatch = Partial<{
  effectiveFrom: BusinessDate;
  effectiveThrough: BusinessDate;
}>;

export function validateEmploymentAgreementMissingFields(value: unknown): DomainValidationResult<string[]> {
  if (!Array.isArray(value) || value.some((field) => typeof field !== "string" || field.length === 0)) {
    return failCommand("协议 baseline 缺失字段投影无效", 500, "missingFields");
  }
  return okCommand([...new Set(value)]);
}

export interface EmploymentAgreementCommandMeta {
  sourceKind: string;
  sourceRef: string | null;
  reason: string | null;
}

interface ExistingAgreementCommandBase extends EmploymentAgreementCommandMeta {
  agreementUid: string;
  expectedVersion: number;
}

export type EmploymentAgreementCommand =
  | (EmploymentAgreementCommandMeta & {
      kind: "create";
      employmentId: number;
      isPrimary: boolean;
      effectiveFrom: BusinessDate;
      effectiveThrough: BusinessDate | null;
      termKind: "initial" | "permanent";
      content: EmploymentAgreementContent;
    })
  | (ExistingAgreementCommandBase & {
      kind: "replace";
      employmentId: number;
      isPrimary: boolean;
      effectiveFrom: BusinessDate;
      effectiveThrough: BusinessDate | null;
      termKind: "initial" | "permanent";
      content: EmploymentAgreementContent;
    })
  | (ExistingAgreementCommandBase & {
      kind: "renew";
      effectiveFrom: BusinessDate;
      effectiveThrough: BusinessDate | null;
      termKind: "renewal" | "permanent";
    })
  | (ExistingAgreementCommandBase & {
      kind: "end";
      termUid: string;
      effectiveThrough: BusinessDate;
    })
  | (ExistingAgreementCommandBase & {
      kind: "correct";
      termUid: string;
      effectiveFrom: BusinessDate;
      effectiveThrough: BusinessDate | null;
      termKind: "initial" | "renewal" | "permanent";
    })
  | (ExistingAgreementCommandBase & {
      kind: "supplement-term";
      termUid: string;
      patch: EmploymentAgreementTermPatch;
    })
  | (ExistingAgreementCommandBase & {
      kind: "supplement-missing";
      patch: EmploymentAgreementContentPatch;
    })
  | (ExistingAgreementCommandBase & {
      kind: "correct-existing";
      patch: EmploymentAgreementContentPatch;
    })
  | (ExistingAgreementCommandBase & {
      kind: "set-primary";
    })
  | (ExistingAgreementCommandBase & {
      kind: "cancel-future";
      termUid: string;
    });

export function buildEmploymentAgreementCommand(
  input: unknown,
): DomainValidationResult<EmploymentAgreementCommand> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failCommand("协议命令无效");
  const raw = input as Record<string, unknown>;
  const rawKind = normalizedString(raw.kind);
  if (!rawKind || !EMPLOYMENT_AGREEMENT_COMMAND_KINDS.includes(rawKind as EmploymentAgreementCommandKind)) {
    return failCommand("协议命令类型无效", 400, "kind");
  }
  const kind = rawKind as EmploymentAgreementCommandKind;
  const requiredFieldIssue = validateRequiredCommandFields(kind, raw);
  if (requiredFieldIssue) return requiredFieldIssue;
  const meta = commandMeta(raw);
  if (!meta.ok) return meta;

  if (kind === "create") {
    const employmentId = positiveInteger(raw.employmentId);
    if (!employmentId) return failCommand("雇佣记录ID无效", 400, "employmentId");
    const termKind = agreementTermKind(raw.termKind, ["initial", "permanent"]);
    if (!termKind) return failCommand("期限性质无效", 400, "termKind");
    const period = agreementPeriod(raw, termKind);
    if (!period.ok) return period;
    const content = agreementContent(raw.content);
    if (!content.ok) return content;
    return okCommand({
      kind,
      employmentId,
      isPrimary: raw.isPrimary === true,
      termKind,
      ...period.data,
      content: content.data,
      ...meta.data,
    });
  }

  const target = existingTarget(raw);
  if (!target.ok) return target;
  if (kind === "set-primary") return okCommand({ kind, ...target.data, ...meta.data });

  if (kind === "replace") {
    const employmentId = positiveInteger(raw.employmentId);
    if (!employmentId) return failCommand("雇佣记录ID无效", 400, "employmentId");
    const termKind = agreementTermKind(raw.termKind, ["initial", "permanent"]);
    if (!termKind) return failCommand("期限性质无效", 400, "termKind");
    const period = agreementPeriod(raw, termKind);
    if (!period.ok) return period;
    const content = agreementContent(raw.content);
    if (!content.ok) return content;
    return okCommand({
      kind,
      employmentId,
      isPrimary: raw.isPrimary === true,
      termKind,
      ...period.data,
      content: content.data,
      ...target.data,
      ...meta.data,
    });
  }

  if (kind === "supplement-missing" || kind === "correct-existing") {
    const patch = agreementContentPatch(raw.patch);
    return patch.ok
      ? okCommand({ kind, patch: patch.data, ...target.data, ...meta.data })
      : patch;
  }

  if (kind === "renew") {
    const termKind = agreementTermKind(raw.termKind, ["renewal", "permanent"]);
    if (!termKind) return failCommand("期限性质无效", 400, "termKind");
    const period = agreementPeriod(raw, termKind);
    if (!period.ok) return period;
    return okCommand({
      kind,
      termKind,
      ...period.data,
      ...target.data,
      ...meta.data,
    });
  }

  const termUid = stableUid(raw.termUid);
  if (!termUid) return failCommand("协议期限ID无效", 400, "termUid");
  if (kind === "supplement-term") {
    const patch = agreementTermPatch(raw.patch);
    return patch.ok
      ? okCommand({ kind, termUid, patch: patch.data, ...target.data, ...meta.data })
      : patch;
  }
  if (kind === "cancel-future") return okCommand({ kind, termUid, ...target.data, ...meta.data });

  if (kind === "end") {
    const effectiveThrough = parseBusinessDate(raw.effectiveThrough);
    return effectiveThrough
      ? okCommand({ kind, termUid, effectiveThrough, ...target.data, ...meta.data })
      : failCommand("结束日期无效", 400, "effectiveThrough");
  }

  const termKind = agreementTermKind(raw.termKind, ["initial", "renewal", "permanent"]);
  if (!termKind) return failCommand("期限性质无效", 400, "termKind");
  const period = agreementPeriod(raw, termKind);
  if (!period.ok) return period;
  return okCommand({
    kind,
    termUid,
    termKind,
    ...period.data,
    ...target.data,
    ...meta.data,
  });
}

export async function validateEmploymentAgreementContentReferences(content: EmploymentAgreementContent) {
  if (!(await isValidCompanyName(content.company))) return { message: "公司不存在" };
  for (const field of ["insuranceStatus", "legalRelation", "contractType", "employmentForm"] as const) {
    if (!validateContractOption(field, content[field])) return { message: `${field} 不在允许范围内` };
  }
  return null;
}

export function employmentAgreementContentPatchFields(
  patch: EmploymentAgreementContentPatch,
): string[] {
  return Object.keys(patch).map((field) => `content.${field}`);
}

export function employmentAgreementTemporalContractIssue(
  command: EmploymentAgreementCommand,
  today = workspaceBusinessDate(new Date()),
) {
  if (businessTemporalRetrospectiveChanges(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy) === "allow") return null;
  const effectiveDate = command.kind === "create" || command.kind === "replace" || command.kind === "renew"
    ? command.effectiveFrom
    : command.kind === "end"
      ? command.effectiveThrough
      : null;
  return effectiveDate && effectiveDate < today
    ? "该合同期限不允许补录历史日期"
    : null;
}

export function employmentAgreementTermOverlapIssue(
  existing: Array<{ recordState: string; effectiveFrom: string | null; effectiveThrough: string | null }>,
  proposed: { effectiveFrom: string; effectiveThrough: string | null },
) {
  if (HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy.overlaps === "allow") return null;
  const proposedWindow = inclusiveBusinessPeriodToWindow({
    validFrom: proposed.effectiveFrom,
    validThrough: proposed.effectiveThrough,
  });
  if (!proposedWindow) return "合同期限无效";
  const overlaps = existing.some((term) => {
    if (term.recordState !== "confirmed" || !term.effectiveFrom) return false;
    const window = inclusiveBusinessPeriodToWindow({
      validFrom: term.effectiveFrom,
      validThrough: term.effectiveThrough,
    });
    return !window || businessDateWindowsOverlap(window, proposedWindow);
  });
  return overlaps ? "合同期限不能与已有期限重叠" : null;
}

function existingTarget(raw: Record<string, unknown>) {
  const agreementUid = stableUid(raw.agreementUid);
  if (!agreementUid) return failCommand("协议ID无效", 400, "agreementUid");
  const expectedVersion = positiveInteger(raw.expectedVersion);
  if (!expectedVersion) return failCommand("协议版本无效", 400, "expectedVersion");
  return okCommand({ agreementUid, expectedVersion });
}

function commandMeta(raw: Record<string, unknown>) {
  const sourceKind = normalizedString(raw.sourceKind) ?? "workspace";
  if (sourceKind.length > 64) return failCommand("协议来源类型过长", 400, "sourceKind");
  const sourceRef = nullableString(raw.sourceRef);
  const reason = nullableString(raw.reason);
  if (sourceRef && sourceRef.length > 200) return failCommand("协议来源标识过长", 400, "sourceRef");
  if (reason && reason.length > 1000) return failCommand("协议变更说明过长", 400, "reason");
  return okCommand({ sourceKind, sourceRef, reason });
}

function agreementPeriod(
  raw: Pick<Record<string, unknown>, "effectiveFrom" | "effectiveThrough">,
  termKind: "initial" | "renewal" | "permanent",
) {
  const effectiveFrom = parseBusinessDate(raw.effectiveFrom);
  if (!effectiveFrom) return failCommand("协议开始日期无效", 400, "effectiveFrom");
  const effectiveThrough = raw.effectiveThrough == null || raw.effectiveThrough === ""
    ? null
    : parseBusinessDate(raw.effectiveThrough);
  if (raw.effectiveThrough != null && raw.effectiveThrough !== "" && !effectiveThrough) {
    return failCommand("协议到期日期无效", 400, "effectiveThrough");
  }
  if (effectiveThrough && effectiveFrom > effectiveThrough) {
    return failCommand("协议开始日期不能晚于到期日期", 409, "effectiveThrough");
  }
  if (termKind === "permanent" && effectiveThrough) {
    return failCommand("无固定期限不得填写到期日期", 409, "effectiveThrough");
  }
  if (termKind !== "permanent" && !effectiveThrough) {
    return failCommand("固定期限必须填写到期日期", 400, "effectiveThrough");
  }
  return okCommand({ effectiveFrom, effectiveThrough });
}

function agreementTermKind<T extends "initial" | "renewal" | "permanent">(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T
    : null;
}

function agreementTermPatch(value: unknown): DomainValidationResult<EmploymentAgreementTermPatch> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failCommand("期限补充资料无效", 400, "patch");
  }
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.some((key) => key !== "effectiveFrom" && key !== "effectiveThrough")) {
    return failCommand("期限补充字段无效", 400, "patch");
  }
  const patch: EmploymentAgreementTermPatch = {};
  if (Object.hasOwn(raw, "effectiveFrom")) {
    const effectiveFrom = parseBusinessDate(raw.effectiveFrom);
    if (!effectiveFrom) return failCommand("协议开始日期无效", 400, "effectiveFrom");
    patch.effectiveFrom = effectiveFrom;
  }
  if (Object.hasOwn(raw, "effectiveThrough")) {
    const effectiveThrough = parseBusinessDate(raw.effectiveThrough);
    if (!effectiveThrough) return failCommand("协议到期日期无效", 400, "effectiveThrough");
    patch.effectiveThrough = effectiveThrough;
  }
  return okCommand(patch);
}

function agreementContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return failCommand("协议内容无效", 400, "content");
  const raw = value as Record<string, unknown>;
  const company = nullableString(raw.company);
  const confidentialityDate = optionalDate(raw.confidentialityDate);
  if (confidentialityDate === "invalid") return failCommand("保密协议日期无效", 400, "confidentialityDate");
  const nonCompeteDate = optionalDate(raw.nonCompeteDate);
  if (nonCompeteDate === "invalid") return failCommand("竞业限制日期无效", 400, "nonCompeteDate");
  return okCommand({
    company,
    insuranceStatus: nullableString(raw.insuranceStatus),
    legalRelation: nullableString(raw.legalRelation),
    contractType: nullableString(raw.contractType),
    employmentForm: nullableString(raw.employmentForm),
    confidentialityDate,
    nonCompeteDate,
  } satisfies EmploymentAgreementContent);
}

function agreementContentPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failCommand("协议资料变更无效", 400, "patch");
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    "company",
    "insuranceStatus",
    "legalRelation",
    "contractType",
    "employmentForm",
    "confidentialityDate",
    "nonCompeteDate",
  ]);
  const keys = Object.keys(raw);
  if (keys.length === 0) return failCommand("至少提交一个协议资料字段", 400, "patch");
  if (keys.some((key) => !allowed.has(key))) return failCommand("协议资料字段无效", 400, "patch");
  const parsed = agreementContent(raw);
  if (!parsed.ok) return parsed;
  return okCommand(Object.fromEntries(keys.map((key) => [
    key,
    parsed.data[key as keyof EmploymentAgreementContent],
  ])) as EmploymentAgreementContentPatch);
}

function optionalDate(value: unknown): BusinessDate | null | "invalid" {
  if (value == null || value === "") return null;
  return parseBusinessDate(value) ?? "invalid";
}

function stableUid(value: unknown) {
  const normalized = normalizedString(value);
  return normalized && /^[0-9a-z][0-9a-z._:-]{7,127}$/i.test(normalized) ? normalized : null;
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nullableString(value: unknown) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function validateRequiredCommandFields(
  kind: EmploymentAgreementCommandKind,
  raw: Record<string, unknown>,
) {
  const missing = EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS[kind].find((field) => (
    field !== "kind" && isMissingRequiredValue(raw[field])
  ));
  return missing
    ? failCommand(`${employmentAgreementFieldLabel(kind, missing)}为必填项`, 400, missing)
    : null;
}

function isMissingRequiredValue(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}
