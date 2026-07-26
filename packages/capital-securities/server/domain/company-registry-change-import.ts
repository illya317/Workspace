export type CompanyRegistryChangeCategory = "company_name" | "legal_representative" | "officers" | "ownership";

export type CompanyRegistryCsvRow = {
  sourceRow: number;
  companyName: string;
  changeTime: string;
  changeItem: string;
  contentBefore: string;
  contentAfter: string;
  createTime: string;
};

export function parseCompanyRegistryCsv(source: string): CompanyRegistryCsvRow[] {
  const records = parseCsvRecords(source);
  const header = records.shift()?.map((value) => value.replace(/^\uFEFF/, ""));
  const expected = ["company_name", "changeTime", "changeItem", "contentBefore", "contentAfter", "createTime"];
  if (!header || header.length !== expected.length || header.some((value, index) => value !== expected[index])) {
    throw new Error(`工商变更 CSV 表头不匹配：${header?.join(",") ?? "空文件"}`);
  }
  return records.filter((record) => record.some(Boolean)).map((record, index) => {
    if (record.length !== expected.length) throw new Error(`工商变更 CSV 第 ${index + 2} 行不是 6 列`);
    const [companyName, changeTime, changeItem, contentBefore, contentAfter, createTime] = record;
    if (!companyName || !changeTime || !changeItem || !createTime) {
      throw new Error(`工商变更 CSV 第 ${index + 2} 行缺少必填字段`);
    }
    return {
      sourceRow: index + 2,
      companyName,
      changeTime,
      changeItem,
      contentBefore: contentBefore ?? "",
      contentAfter: contentAfter ?? "",
      createTime,
    };
  });
}

export function classifyCompanyRegistryChange(changeItem: string): CompanyRegistryChangeCategory | null {
  if (changeItem.includes("名称变更")) {
    return "company_name";
  }
  if (changeItem.includes("高级管理人员备案") || changeItem.includes("董事（理事）、经理、监事")) {
    return "officers";
  }
  if (changeItem.includes("负责人变更") || changeItem.includes("法定代表人")) {
    return "legal_representative";
  }
  if (
    changeItem.includes("投资人")
    || changeItem.includes("股东变更")
    || changeItem.includes("出资方式变更")
  ) {
    return "ownership";
  }
  return null;
}

export function normalizeLegalRepresentative(value: string) {
  return value.replace(/\*/g, "").replace(/（已撤销）/g, "").trim();
}

export function normalizeRegistryPartyName(value: string) {
  return value
    .replace(/\*/g, "")
    .replace(/（已撤销）/g, "")
    .replace(/[，,]\s*(?:企业法人|法人|自然人|个人)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type RegistryOwnershipParticipantSnapshot = {
  sequence: number;
  rawName: string;
  normalizedName: string;
};

export function isRegistryOwnershipRosterChange(changeItem: string) {
  return changeItem.includes("投资人") || changeItem.includes("股东变更");
}

export function parseRegistryOwnershipParticipants(value: string): RegistryOwnershipParticipantSnapshot[] {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((rawName, index) => ({
      sequence: index + 1,
      rawName,
      normalizedName: normalizeRegistryPartyName(rawName),
    }));
}

export type CurrentSoleInvestorEvidence = {
  companyName: string;
  ownerPartyId: number;
  effectiveFrom: string;
  sourceRow: number;
  confirmedBySourceRow: number;
};

export function inferCurrentSoleInvestorEvidence(
  rows: readonly CompanyRegistryCsvRow[],
  resolvePartyId: (name: string) => number | null,
): CurrentSoleInvestorEvidence[] {
  const ownershipRows = rows.filter((row) => (
    classifyCompanyRegistryChange(row.changeItem) === "ownership"
    && isRegistryOwnershipRosterChange(row.changeItem)
  ));
  const rowsByCompany = new Map<string, CompanyRegistryCsvRow[]>();
  for (const row of ownershipRows) {
    rowsByCompany.set(row.companyName, [...(rowsByCompany.get(row.companyName) ?? []), row]);
  }
  const evidence: CurrentSoleInvestorEvidence[] = [];
  for (const [companyName, companyRows] of rowsByCompany) {
    const ordered = [...companyRows].sort((left, right) => (
      left.changeTime.localeCompare(right.changeTime) || left.sourceRow - right.sourceRow
    ));
    const latest = ordered.at(-1);
    if (!latest) continue;
    const ownerPartyId = resolvePartyId(normalizeRegistryPartyName(latest.contentAfter));
    if (ownerPartyId === null) continue;
    let first = latest;
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      const candidate = ordered[index];
      if (!candidate) continue;
      const candidateOwnerPartyId = resolvePartyId(normalizeRegistryPartyName(candidate.contentAfter));
      if (candidateOwnerPartyId !== ownerPartyId) break;
      first = candidate;
    }
    evidence.push({
      companyName,
      ownerPartyId,
      effectiveFrom: first.changeTime,
      sourceRow: first.sourceRow,
      confirmedBySourceRow: latest.sourceRow,
    });
  }
  return evidence.sort((left, right) => left.companyName.localeCompare(right.companyName, "zh-CN"));
}

function parseCsvRecords(source: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === ",") {
      record.push(field);
      field = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      continue;
    }
    field += character;
  }
  if (quoted) throw new Error("工商变更 CSV 存在未闭合引号");
  if (field || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
