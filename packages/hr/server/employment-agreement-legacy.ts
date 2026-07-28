import "server-only";

import { createHash } from "node:crypto";

import { classifyInclusiveBusinessPeriod } from "@workspace/platform/contracts/business-temporal";
import type {
  ContractRow,
  EmploymentAgreementRevisionRow,
  EmploymentAgreementTermRow,
} from "@workspace/hr/types";
import { parseContracts } from "./contract-records";

export interface LegacyAgreementPreflightIssue {
  code:
    | "legacy.invalid_json"
    | "legacy.empty_record"
    | "legacy.missing_company"
    | "legacy.missing_period"
    | "legacy.invalid_period"
    | "legacy.duplicate_record";
  employmentId: number;
  fingerprint?: string;
  detail: string;
}

export interface LegacyAgreementSource {
  id: number;
  contracts: string | null;
  employee: { employeeId: string | null; name: string | null } | null;
}

export function inspectLegacyEmploymentAgreements(
  source: Pick<LegacyAgreementSource, "id" | "contracts">,
): LegacyAgreementPreflightIssue[] {
  if (!source.contracts) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(source.contracts);
  } catch {
    return [{ code: "legacy.invalid_json", employmentId: source.id, detail: "contracts 不是合法 JSON" }];
  }
  const records = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  if (records.length === 0) {
    return [{ code: "legacy.empty_record", employmentId: source.id, detail: "contracts 没有可识别的协议对象" }];
  }
  const issues: LegacyAgreementPreflightIssue[] = [];
  const seen = new Map<string, number>();
  for (const item of records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ code: "legacy.empty_record", employmentId: source.id, detail: "协议条目不是对象" });
      continue;
    }
    const normalized = normalizeLegacyRecord(item as Record<string, unknown>);
    const fingerprint = legacyAgreementFingerprint(normalized);
    seen.set(fingerprint, (seen.get(fingerprint) ?? 0) + 1);
    if (!text(normalized.company)) {
      issues.push({ code: "legacy.missing_company", employmentId: source.id, fingerprint, detail: "协议缺少签约公司" });
    }
    const terms = legacyTerms(normalized, fingerprint, "1970-01-01");
    if (terms.length === 0) {
      issues.push({ code: "legacy.missing_period", employmentId: source.id, fingerprint, detail: "协议缺少可确定的起始日期" });
    }
    if (terms.some((term) => term.temporalState === "invalid")) {
      issues.push({ code: "legacy.invalid_period", employmentId: source.id, fingerprint, detail: "协议包含倒置或非法期间" });
    }
  }
  for (const [fingerprint, count] of seen) {
    if (count > 1) {
      issues.push({
        code: "legacy.duplicate_record",
        employmentId: source.id,
        fingerprint,
        detail: `存在 ${count} 条内容完全相同的协议，无法自动建立一一对应的稳定身份`,
      });
    }
  }
  return issues;
}

export function buildLegacyAgreementRows(
  sources: LegacyAgreementSource[],
  asOfDate: string,
): ContractRow[] {
  const rows: ContractRow[] = [];
  for (const source of sources) {
    const records = parseContracts(source.contracts).map(normalizeLegacyRecord);
    const occurrence = new Map<string, number>();
    const preflight = inspectLegacyEmploymentAgreements(source);
    const ambiguousFingerprints = new Set(preflight.map((issue) => issue.fingerprint).filter(Boolean));
    for (const record of records) {
      const fingerprint = legacyAgreementFingerprint(record);
      const duplicateNo = (occurrence.get(fingerprint) ?? 0) + 1;
      occurrence.set(fingerprint, duplicateNo);
      const terms = legacyTerms(record, fingerprint, asOfDate);
      const content = legacyContent(record);
      const revision: EmploymentAgreementRevisionRow = {
        revisionUid: `legacy-revision:${fingerprint}`,
        revisionNo: 1,
        recordState: "confirmed",
        changeKind: "legacy",
        content,
        supersedesRevisionUid: null,
        reason: "Employment.contracts legacy JSON 只读投影",
        createdAt: "",
      };
      const state = preferredTemporalState(terms);
      const startDates = terms.map((term) => term.effectiveFrom);
      const endDates = terms.map((term) => term.effectiveThrough).filter((value): value is string => Boolean(value));
      rows.push({
        id: `legacy:${source.id}:${fingerprint}:${duplicateNo}`,
        agreementUid: null,
        employmentId: source.id,
        employeeId: source.employee?.employeeId || "",
        employeeName: source.employee?.name || "",
        company: content.company || "",
        isPrimary: record.isPrimary === true,
        isInsuredHere: false,
        insuranceStatus: content.insuranceStatus,
        legalRelation: content.legalRelation || "",
        contractType: content.contractType || "",
        employmentForm: content.employmentForm || "",
        firstContractStartDate: terms[0]?.effectiveFrom ?? null,
        firstContractEndDate: terms[0]?.effectiveThrough ?? null,
        secondContractStartDate: terms[1]?.effectiveFrom ?? null,
        secondContractEndDate: terms[1]?.effectiveThrough ?? null,
        thirdContractStartDate: terms[2]?.effectiveFrom ?? null,
        thirdContractEndDate: terms[2]?.effectiveThrough ?? null,
        permanentContractDate: terms.find((term) => term.termKind === "permanent")?.effectiveFrom ?? null,
        expiryDate: terms.at(-1)?.effectiveThrough ?? null,
        confidentialityDate: content.confidentialityDate,
        nonCompeteDate: content.nonCompeteDate,
        endDate: text(record.endDate),
        recordState: "unknown",
        temporalState: startDates.length === 0 || endDates.some((end, index) => startDates[index] && startDates[index] > end)
          ? "invalid"
          : state,
        version: null,
        source: "legacy-json",
        migrationState: ambiguousFingerprints.has(fingerprint) ? "legacy-ambiguous" : "legacy-read-only",
        missingFields: [],
        currentRevisionUid: revision.revisionUid,
        terms,
        revisions: [revision],
        attachments: [],
      });
    }
  }
  return rows;
}

function legacyTerms(
  record: Record<string, unknown>,
  fingerprint: string,
  asOfDate: string,
): EmploymentAgreementTermRow[] {
  const pairs: Array<[unknown, unknown, EmploymentAgreementTermRow["termKind"]]> = [
    [record.firstContractStartDate, record.firstContractEndDate, "initial"],
    [record.secondContractStartDate, record.secondContractEndDate, "renewal"],
    [record.thirdContractStartDate, record.thirdContractEndDate, "renewal"],
    [record.permanentContractDate, record.endDate, "permanent"],
  ];
  return pairs.flatMap(([from, through, termKind], index) => {
    const effectiveFrom = text(from);
    if (!effectiveFrom) return [];
    const effectiveThrough = text(through);
    return [{
      termUid: `legacy-term:${fingerprint}:${index + 1}`,
      storageSequence: index + 1,
      sequence: index + 1,
      termKind,
      effectiveFrom,
      effectiveThrough,
      recordState: "unknown",
      temporalState: classifyInclusiveBusinessPeriod({ validFrom: effectiveFrom, validThrough: effectiveThrough }, asOfDate),
      changeKind: "legacy",
      reason: "Employment.contracts legacy JSON 只读投影",
    }];
  });
}

function legacyContent(record: Record<string, unknown>): EmploymentAgreementRevisionRow["content"] {
  return {
    company: text(record.company),
    insuranceStatus: text(record.insuranceStatus),
    legalRelation: text(record.legalRelation),
    contractType: text(record.contractType),
    employmentForm: text(record.employmentForm),
    confidentialityDate: text(record.confidentialityDate),
    nonCompeteDate: text(record.nonCompeteDate),
  };
}

function normalizeLegacyRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value === "" ? null : value]));
}

function preferredTemporalState(terms: EmploymentAgreementTermRow[]) {
  if (terms.some((term) => term.temporalState === "current")) return "current" as const;
  if (terms.some((term) => term.temporalState === "upcoming")) return "upcoming" as const;
  if (terms.some((term) => term.temporalState === "invalid")) return "invalid" as const;
  return terms.length > 0 ? "past" as const : "invalid" as const;
}

function legacyAgreementFingerprint(record: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(record)).digest("hex").slice(0, 24);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function text(value: unknown) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}
