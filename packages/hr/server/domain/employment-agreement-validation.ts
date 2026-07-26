import {
  inclusiveBusinessPeriodToWindow,
  parseBusinessDate,
  type BusinessDate,
} from "@workspace/platform/contracts/business-temporal";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { isValidCompanyName, validateContractOption } from "../field-validation";

export const EMPLOYMENT_AGREEMENT_COMMAND_KINDS = [
  "create",
  "renew",
  "end",
  "correct",
  "revise",
  "publish",
  "supersede",
  "set-primary",
  "cancel-future",
] as const;

export type EmploymentAgreementCommandKind = typeof EMPLOYMENT_AGREEMENT_COMMAND_KINDS[number];

export interface EmploymentAgreementContent {
  company: string | null;
  insuranceStatus: string | null;
  legalRelation: string | null;
  contractType: string | null;
  employmentForm: string | null;
  confidentialityDate: BusinessDate | null;
  nonCompeteDate: BusinessDate | null;
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
      kind: "revise" | "supersede";
      content: EmploymentAgreementContent;
    })
  | (ExistingAgreementCommandBase & {
      kind: "publish";
      revisionUid: string;
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
  const kind = normalizedString(raw.kind);
  if (!kind || !EMPLOYMENT_AGREEMENT_COMMAND_KINDS.includes(kind as EmploymentAgreementCommandKind)) {
    return failCommand("协议命令类型无效", 400, "kind");
  }
  const meta = commandMeta(raw);
  if (!meta.ok) return meta;
  if (["end", "correct", "supersede", "cancel-future"].includes(kind) && !meta.data.reason) {
    return failCommand("该协议变更必须填写说明", 400, "reason");
  }

  if (kind === "create") {
    const employmentId = positiveInteger(raw.employmentId);
    if (!employmentId) return failCommand("雇佣记录ID无效", 400, "employmentId");
    const period = agreementPeriod(raw);
    if (!period.ok) return period;
    const content = agreementContent(raw.content);
    if (!content.ok) return content;
    return okCommand({
      kind,
      employmentId,
      isPrimary: raw.isPrimary === true,
      termKind: raw.termKind === "permanent" ? "permanent" : "initial",
      ...period.data,
      content: content.data,
      ...meta.data,
    });
  }

  const target = existingTarget(raw);
  if (!target.ok) return target;
  if (kind === "set-primary") return okCommand({ kind, ...target.data, ...meta.data });

  if (kind === "publish") {
    const revisionUid = stableUid(raw.revisionUid);
    return revisionUid
      ? okCommand({ kind, revisionUid, ...target.data, ...meta.data })
      : failCommand("修订ID无效", 400, "revisionUid");
  }

  if (kind === "revise" || kind === "supersede") {
    const content = agreementContent(raw.content);
    return content.ok
      ? okCommand({ kind, content: content.data, ...target.data, ...meta.data })
      : content;
  }

  if (kind === "renew") {
    const period = agreementPeriod(raw);
    if (!period.ok) return period;
    return okCommand({
      kind,
      termKind: raw.termKind === "permanent" ? "permanent" : "renewal",
      ...period.data,
      ...target.data,
      ...meta.data,
    });
  }

  const termUid = stableUid(raw.termUid);
  if (!termUid) return failCommand("协议期限ID无效", 400, "termUid");
  if (kind === "cancel-future") return okCommand({ kind, termUid, ...target.data, ...meta.data });

  if (kind === "end") {
    const effectiveThrough = parseBusinessDate(raw.effectiveThrough);
    return effectiveThrough
      ? okCommand({ kind, termUid, effectiveThrough, ...target.data, ...meta.data })
      : failCommand("终止日期无效", 400, "effectiveThrough");
  }

  const period = agreementPeriod(raw);
  if (!period.ok) return period;
  return okCommand({
    kind,
    termUid,
    termKind: raw.termKind === "permanent"
      ? "permanent"
      : raw.termKind === "renewal"
        ? "renewal"
        : "initial",
    ...period.data,
    ...target.data,
    ...meta.data,
  });
}

export function employmentAgreementPeriodsOverlap(
  left: { effectiveFrom: string; effectiveThrough?: string | null },
  right: { effectiveFrom: string; effectiveThrough?: string | null },
) {
  const leftWindow = inclusiveBusinessPeriodToWindow({
    validFrom: left.effectiveFrom,
    validThrough: left.effectiveThrough,
  });
  const rightWindow = inclusiveBusinessPeriodToWindow({
    validFrom: right.effectiveFrom,
    validThrough: right.effectiveThrough,
  });
  if (!leftWindow || !rightWindow) return true;
  return (!leftWindow.validToExclusive || leftWindow.validToExclusive > (rightWindow.validFrom ?? "0001-01-01"))
    && (!rightWindow.validToExclusive || rightWindow.validToExclusive > (leftWindow.validFrom ?? "0001-01-01"));
}

export async function validateEmploymentAgreementContentReferences(content: EmploymentAgreementContent) {
  if (!(await isValidCompanyName(content.company))) return { message: "公司不存在" };
  for (const field of ["insuranceStatus", "legalRelation", "contractType", "employmentForm"] as const) {
    if (!validateContractOption(field, content[field])) return { message: `${field} 不在允许范围内` };
  }
  return null;
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

function agreementPeriod(raw: Record<string, unknown>) {
  const effectiveFrom = parseBusinessDate(raw.effectiveFrom);
  if (!effectiveFrom) return failCommand("协议开始日期无效", 400, "effectiveFrom");
  const effectiveThrough = raw.effectiveThrough == null || raw.effectiveThrough === ""
    ? null
    : parseBusinessDate(raw.effectiveThrough);
  if (raw.effectiveThrough != null && raw.effectiveThrough !== "" && !effectiveThrough) {
    return failCommand("协议结束日期无效", 400, "effectiveThrough");
  }
  if (effectiveThrough && effectiveFrom > effectiveThrough) {
    return failCommand("协议开始日期不能晚于结束日期", 409, "effectiveThrough");
  }
  return okCommand({ effectiveFrom, effectiveThrough });
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
