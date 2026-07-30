import { requestDirectCommandJson } from "@workspace/platform/ui/api-client";
import type {
  ContractRow,
  EmployeeProfile,
  EmploymentAgreementTermRow,
} from "@workspace/hr/types";
import {
  normalizeContractRow,
  normalizeValue,
  persistableContractRows,
  valuesEqual,
} from "./EmployeeProfilePersistenceValues";

const CONTENT_FIELDS = [
  "company",
  "insuranceStatus",
  "legalRelation",
  "contractType",
  "employmentForm",
  "confidentialityDate",
  "nonCompeteDate",
] as const;

type ContentField = typeof CONTENT_FIELDS[number];
type AgreementResponse = { agreements: ContractRow[] };
type AgreementCommand = Record<string, unknown>;

type DesiredTerm = {
  effectiveFrom: string;
  effectiveThrough: string | null;
  termKind: "initial" | "renewal" | "permanent";
};

export async function persistEmployeeAgreements(profile: EmployeeProfile, rows: ContractRow[]) {
  const employeeId = profile.employee.id;
  const persistableRows = persistableContractRows(rows);
  const draftsByUid = new Map(persistableRows.flatMap((row) => row.agreementUid ? [[row.agreementUid, row]] : []));
  const currentByUid = new Map(profile.contracts.flatMap((row) => row.agreementUid ? [[row.agreementUid, row]] : []));

  for (const original of profile.contracts) {
    if (!original.agreementUid || draftsByUid.has(original.agreementUid)) continue;
    if (original.source !== "normalized" || !original.version) {
      throw new Error("历史合同尚未迁移，不能从员工档案直接结束");
    }
    currentByUid.set(original.agreementUid, await endAgreement(employeeId, original, profile.asOfDate));
  }

  for (const draft of persistableRows.map(normalizeContractRow)) {
    if (draft.isNew) {
      const created = await createAgreement(employeeId, currentByUid, draft);
      await syncTerms(employeeId, created, draft, currentByUid);
      continue;
    }
    if (!draft.agreementUid) continue;
    const original = currentByUid.get(draft.agreementUid);
    if (!original) continue;
    if (original.source !== "normalized" || !original.version) {
      if (!rowsEqual(original, draft)) throw new Error("历史合同尚未迁移，只能查看，不能直接覆盖");
      continue;
    }
    const afterContent = await syncContent(employeeId, original, draft);
    currentByUid.set(draft.agreementUid, afterContent);
    await syncTerms(employeeId, afterContent, draft, currentByUid);
  }

  const desiredPrimary = persistableRows.find((row) => row.agreementUid && row.isPrimary);
  if (desiredPrimary?.agreementUid) {
    const current = currentByUid.get(desiredPrimary.agreementUid);
    if (current && !current.isPrimary) {
      currentByUid.set(current.agreementUid!, await sendExistingCommand(employeeId, current, {
        kind: "set-primary",
      }));
    }
  }
}

async function createAgreement(employeeId: number, currentByUid: Map<string, ContractRow>, draft: ContractRow) {
  const terms = desiredTerms(draft);
  const first = terms[0];
  if (!draft.employmentId) throw new Error("新增合同必须先选择有效任职记录");
  if (!first) throw new Error("新增合同必须填写开始日期或长期合同日期");
  const knownUids = new Set(currentByUid.keys());
  const response = await sendCommand(employeeId, {
    kind: "create",
    employmentId: draft.employmentId,
    isPrimary: draft.isPrimary,
    effectiveFrom: first.effectiveFrom,
    effectiveThrough: first.effectiveThrough,
    termKind: first.termKind === "permanent" ? "permanent" : "initial",
    content: agreementContent(draft),
  });
  const created = response.agreements.find((row) => (
    row.agreementUid && !knownUids.has(row.agreementUid) && row.employmentId === draft.employmentId
  ));
  if (!created) throw new Error("新增合同后无法定位返回记录，请刷新后重试");
  mergeAgreementResponse(currentByUid, response.agreements);
  return created;
}

function mergeAgreementResponse(currentByUid: Map<string, ContractRow>, agreements: ContractRow[]) {
  for (const agreement of agreements) {
    if (agreement.agreementUid) currentByUid.set(agreement.agreementUid, agreement);
  }
}

async function syncContent(employeeId: number, original: ContractRow, draft: ContractRow) {
  const changed = CONTENT_FIELDS.filter((field) => !valuesEqual(
    normalizeValue(original[field]),
    normalizeValue(draft[field]),
  ));
  if (changed.length === 0) return original;
  let current = original;
  const missing = new Set(current.missingFields.map((field) => field.path));
  const supplement = changed.filter((field) => missing.has(`content.${field}`));
  if (supplement.length > 0) {
    current = await sendExistingCommand(employeeId, current, {
      kind: "supplement-missing",
      patch: contentPatch(draft, supplement),
      reason: "从员工档案补充合同资料",
    });
  }
  const correction = changed.filter((field) => !supplement.includes(field));
  if (correction.length > 0) {
    current = await sendExistingCommand(employeeId, current, {
      kind: "correct-existing",
      patch: contentPatch(draft, correction),
      reason: "从员工档案修正合同资料",
    });
  }
  return current;
}

async function syncTerms(
  employeeId: number,
  initial: ContractRow,
  draft: ContractRow,
  currentByUid: Map<string, ContractRow>,
) {
  let current = initial;
  const desired = desiredTerms(draft);
  for (let index = 0; index < desired.length; index += 1) {
    const next = desired[index];
    const existing = authoritativeTerms(current)[index];
    if (!existing) {
      current = await sendExistingCommand(employeeId, current, {
        kind: "renew",
        ...next,
        termKind: next.termKind === "permanent" ? "permanent" : "renewal",
      });
      continue;
    }
    if (termMatches(existing, next)) continue;
    current = await sendExistingCommand(employeeId, current, {
      kind: "correct",
      termUid: existing.termUid,
      ...next,
      reason: "从员工档案修正合同期限",
    });
  }
  const remaining = authoritativeTerms(current).slice(desired.length);
  if (remaining.length > 0) {
    throw new Error("不能清空已记录的合同期限；请填写结束日期，未来期限请通过明确取消操作处理");
  }
  if (current.agreementUid) currentByUid.set(current.agreementUid, current);
}

async function endAgreement(employeeId: number, initial: ContractRow, effectiveThrough: string) {
  let current = initial;
  for (const term of authoritativeTerms(current).filter((item) => item.temporalState === "upcoming")) {
    current = await sendExistingCommand(employeeId, current, {
      kind: "cancel-future",
      termUid: term.termUid,
      reason: "从员工档案结束合同并取消未来期限",
    });
  }
  const active = authoritativeTerms(current).find((term) => term.temporalState === "current");
  if (!active) return current;
  return sendExistingCommand(employeeId, current, {
    kind: "end",
    termUid: active.termUid,
    effectiveThrough,
    reason: "从员工档案结束合同",
  });
}

async function sendExistingCommand(employeeId: number, current: ContractRow, command: AgreementCommand) {
  if (!current.agreementUid || !current.version) throw new Error("合同版本无效，请刷新后重试");
  const response = await sendCommand(employeeId, {
    ...command,
    agreementUid: current.agreementUid,
    expectedVersion: current.version,
  });
  const updated = response.agreements.find((row) => row.agreementUid === current.agreementUid);
  if (!updated) throw new Error("保存合同后无法定位返回记录，请刷新后重试");
  return updated;
}

function sendCommand(employeeId: number, command: AgreementCommand) {
  return requestDirectCommandJson<AgreementResponse>(`/api/modules/hr/roster/employee-profiles/${employeeId}/agreements`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

function desiredTerms(row: ContractRow): DesiredTerm[] {
  const regular = [
    [row.firstContractStartDate, row.firstContractEndDate],
    [row.secondContractStartDate, row.secondContractEndDate],
    [row.thirdContractStartDate, row.thirdContractEndDate],
  ] as const;
  const terms: DesiredTerm[] = regular.flatMap(([effectiveFrom, effectiveThrough], index) => effectiveFrom ? [{
    effectiveFrom,
    effectiveThrough,
    termKind: index === 0 ? "initial" as const : "renewal" as const,
  }] : []);
  if (row.permanentContractDate) {
    terms.push({ effectiveFrom: row.permanentContractDate, effectiveThrough: null, termKind: "permanent" });
  }
  return terms;
}

function authoritativeTerms(row: ContractRow) {
  return row.terms
    .filter((term) => term.recordState === "confirmed" || term.recordState === "unknown")
    .sort((left, right) => left.sequence - right.sequence);
}

function termMatches(existing: EmploymentAgreementTermRow, desired: DesiredTerm) {
  return existing.effectiveFrom === desired.effectiveFrom
    && existing.effectiveThrough === desired.effectiveThrough
    && existing.termKind === desired.termKind;
}

function agreementContent(row: ContractRow) {
  return contentPatch(row, [...CONTENT_FIELDS]);
}

function contentPatch(row: ContractRow, fields: readonly ContentField[]) {
  return Object.fromEntries(fields.map((field) => [field, normalizeValue(row[field])])) as Record<ContentField, unknown>;
}

function rowsEqual(left: ContractRow, right: ContractRow) {
  return CONTENT_FIELDS.every((field) => valuesEqual(left[field], right[field]))
    && valuesEqual(left.isPrimary, right.isPrimary)
    && valuesEqual(left.firstContractStartDate, right.firstContractStartDate)
    && valuesEqual(left.firstContractEndDate, right.firstContractEndDate)
    && valuesEqual(left.secondContractStartDate, right.secondContractStartDate)
    && valuesEqual(left.secondContractEndDate, right.secondContractEndDate)
    && valuesEqual(left.thirdContractStartDate, right.thirdContractStartDate)
    && valuesEqual(left.thirdContractEndDate, right.thirdContractEndDate)
    && valuesEqual(left.permanentContractDate, right.permanentContractDate);
}
