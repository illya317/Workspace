import { normalizePartyName, validatePartyNameFacts } from "@workspace/platform/server/party-name-rules";
import { projectEquityLedger, type EquityLedgerEventState } from "./equity-ledger";

export type EvidencePartySpec = {
  key: string;
  companyCode?: string;
  existingName?: string;
  create?: {
    subjectType: "organization" | "individual";
    name: string;
    fullName?: string | null;
    identityNumber: string;
  };
};

export type EvidencePartyName = {
  key: string;
  partyRef: string;
  nameKind: "legal" | "short" | "trade" | "source_alias";
  name: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  datePrecision: "day" | "month" | "year" | "unknown";
  observedDate: string | null;
  sourceLabel: string;
  sourceReference: string;
};

export type EvidenceRegistryFact = {
  key: string;
  companyCode: string;
  changeDate: string;
  category: "legal_representative" | "ownership";
  item: string;
  before: string | null;
  after: string | null;
  observedDate: string | null;
  sourceLabel: string;
  sourceReference: string;
  beforePartyRefs?: string[];
  afterPartyRefs?: string[];
};

export type EvidenceEquityTransaction = {
  sequence: number;
  fromPartyRef: string | null;
  toPartyRef: string | null;
  registeredCapitalAmountYuan: number;
  considerationAmountYuan?: number | null;
  sourceReference?: string | null;
  notes?: string | null;
};

export type EvidenceEquitySnapshotPosition = {
  sequence: number;
  partyRef: string;
  registeredCapitalAmountYuan: number | null;
  assertedShareRatio: number | null;
  sourceReference?: string | null;
  notes?: string | null;
};

export type EvidenceEquityEvent = {
  key: string;
  issuerCompanyCode: string;
  sequence: number;
  eventType: "incorporation" | "capital_increase" | "capital_reduction" | "transfer" | "buyback" | "adjustment" | "confirmation_snapshot";
  eventName: string;
  effectiveDate: string | null;
  effectiveDatePrecision: "day" | "month" | "year" | "unknown";
  ledgerMode: "transactions" | "confirmation_snapshot";
  dataCompleteness: "complete" | "party_list_only" | "known_interests_only";
  registeredCapitalCheckpointYuan: number | null;
  recordStatus: "confirmed" | "pending";
  consolidatedByPartyRefAfter: string | null;
  observedDate: string | null;
  sourceLabel: string;
  sourceReference: string;
  notes?: string | null;
  transactions: EvidenceEquityTransaction[];
  snapshotPositions: EvidenceEquitySnapshotPosition[];
};

export type CapitalEvidencePack = {
  schemaVersion: 2;
  id: string;
  baselineDate: string;
  managedIssuerCompanyCodes: string[];
  managedRegistrySourceLabels: string[];
  companies: Array<{ companyCode: string }>;
  parties: EvidencePartySpec[];
  partyNames: EvidencePartyName[];
  registryFacts: EvidenceRegistryFact[];
  equityEvents: EvidenceEquityEvent[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ownershipRatio(
  registeredCapitalAmountYuan: number | null,
  issuerRegisteredCapitalYuan: number | null,
) {
  if (registeredCapitalAmountYuan === null || issuerRegisteredCapitalYuan === null) return null;
  if (!Number.isFinite(registeredCapitalAmountYuan) || registeredCapitalAmountYuan <= 0) throw new Error("认缴资本必须为正数");
  if (!Number.isFinite(issuerRegisteredCapitalYuan) || issuerRegisteredCapitalYuan <= 0) throw new Error("注册资本总额必须为正数");
  if (registeredCapitalAmountYuan > issuerRegisteredCapitalYuan) throw new Error("认缴资本不得超过注册资本总额");
  return registeredCapitalAmountYuan / issuerRegisteredCapitalYuan;
}

export function validateCapitalEvidencePack(value: unknown): CapitalEvidencePack {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("证据包必须是 JSON 对象");
  const pack = value as Partial<CapitalEvidencePack>;
  if (pack.schemaVersion !== 2 || typeof pack.id !== "string" || !pack.id) throw new Error("证据包版本或 ID 无效");
  requireDate(pack.baselineDate ?? "", "证据包基准日");
  for (const field of [
    "managedIssuerCompanyCodes",
    "managedRegistrySourceLabels",
    "companies",
    "parties",
    "partyNames",
    "registryFacts",
    "equityEvents",
  ] as const) {
    if (!Array.isArray(pack[field])) throw new Error(`证据包字段 ${field} 必须是数组`);
  }
  const result = pack as CapitalEvidencePack;
  unique(result.parties.map((party) => party.key), "主体 key");
  unique(result.partyNames.map((name) => name.key), "名称事实 key");
  unique(result.registryFacts.map((fact) => fact.key), "工商事实 key");
  unique(result.equityEvents.map((event) => event.key), "股权事件 key");
  const partyKeys = new Set(result.parties.map((party) => party.key));
  for (const party of result.parties) {
    const resolverCount = Number(Boolean(party.companyCode)) + Number(Boolean(party.existingName)) + Number(Boolean(party.create));
    if (resolverCount !== 1) throw new Error(`主体 ${party.key} 必须且只能声明一种解析方式`);
    if (party.create && (!party.create.name || !party.create.identityNumber)) throw new Error(`主体 ${party.key} 的新建资料不完整`);
  }
  validateNames(result.partyNames, partyKeys);
  validateRegistryFacts(result.registryFacts, partyKeys);
  validateEquityEvents(result, partyKeys);
  return result;
}

function validateNames(names: readonly EvidencePartyName[], partyKeys: ReadonlySet<string>) {
  const byParty = new Map<string, EvidencePartyName[]>();
  for (const name of names) {
    if (!partyKeys.has(name.partyRef)) throw new Error(`名称事实 ${name.key} 引用了未知主体`);
    if (!name.name.trim() || !normalizePartyName(name.name)) throw new Error(`名称事实 ${name.key} 名称为空`);
    validatePartialDate(name.effectiveFrom, name.datePrecision, `名称事实 ${name.key} 开始日期`);
    if (name.effectiveTo !== null) requireDate(name.effectiveTo, `名称事实 ${name.key} 结束日期`);
    if (name.observedDate !== null) requireDate(name.observedDate, `名称事实 ${name.key} 观察日期`);
    if (name.effectiveFrom && name.effectiveTo && name.effectiveFrom > name.effectiveTo) throw new Error(`名称事实 ${name.key} 日期倒置`);
    if (!name.sourceLabel || !name.sourceReference) throw new Error(`名称事实 ${name.key} 缺少来源`);
    byParty.set(name.partyRef, [...(byParty.get(name.partyRef) ?? []), name]);
  }
  for (const values of byParty.values()) {
    validatePartyNameFacts(values.map((name, index) => ({
      id: index + 1,
      nameKind: name.nameKind,
      name: name.name,
      effectiveFrom: asDate(name.effectiveFrom),
      effectiveTo: asDate(name.effectiveTo),
      recordStatus: "confirmed" as const,
    })));
  }
}

function validateRegistryFacts(facts: readonly EvidenceRegistryFact[], partyKeys: ReadonlySet<string>) {
  for (const fact of facts) {
    requireDate(fact.changeDate, `工商事实 ${fact.key} 变更日期`);
    if (fact.observedDate !== null) requireDate(fact.observedDate, `工商事实 ${fact.key} 记录日期`);
    if (!fact.companyCode || !fact.item || !fact.sourceLabel || !fact.sourceReference) throw new Error(`工商事实 ${fact.key} 缺少必填字段`);
    for (const ref of [...(fact.beforePartyRefs ?? []), ...(fact.afterPartyRefs ?? [])]) {
      if (!partyKeys.has(ref)) throw new Error(`工商事实 ${fact.key} 引用了未知主体 ${ref}`);
    }
    if (fact.category !== "ownership" && (fact.beforePartyRefs?.length || fact.afterPartyRefs?.length)) {
      throw new Error(`非股权事实 ${fact.key} 不得声明股东快照`);
    }
  }
}

function validateEquityEvents(pack: CapitalEvidencePack, partyKeys: ReadonlySet<string>) {
  const managedIssuers = new Set(pack.managedIssuerCompanyCodes);
  const partyId = new Map([...partyKeys].map((key, index) => [key, index + 1]));
  const eventsByIssuer = new Map<string, EvidenceEquityEvent[]>();
  for (const event of pack.equityEvents) {
    if (!managedIssuers.has(event.issuerCompanyCode)) throw new Error(`股权事件 ${event.key} 的公司不在受管范围`);
    validatePartialDate(event.effectiveDate, event.effectiveDatePrecision, `股权事件 ${event.key} 生效日期`);
    if (event.observedDate !== null) requireDate(event.observedDate, `股权事件 ${event.key} 观察日期`);
    if (!event.eventName || !event.sourceLabel || !event.sourceReference) throw new Error(`股权事件 ${event.key} 缺少必填字段`);
    if (event.consolidatedByPartyRefAfter !== null && !partyKeys.has(event.consolidatedByPartyRefAfter)) throw new Error(`股权事件 ${event.key} 的控制方不存在`);
    if (event.ledgerMode === "confirmation_snapshot" && event.eventType !== "confirmation_snapshot") throw new Error(`股权事件 ${event.key} 的快照类型不一致`);
    if (event.ledgerMode === "transactions" && event.eventType === "confirmation_snapshot") throw new Error(`股权事件 ${event.key} 的交易类型不一致`);
    unique(event.transactions.map((item) => String(item.sequence)), `股权事件 ${event.key} 交易序号`);
    unique(event.snapshotPositions.map((item) => String(item.sequence)), `股权事件 ${event.key} 快照序号`);
    for (const transaction of event.transactions) {
      for (const ref of [transaction.fromPartyRef, transaction.toPartyRef]) {
        if (ref !== null && !partyKeys.has(ref)) throw new Error(`股权事件 ${event.key} 引用了未知主体 ${ref}`);
      }
    }
    for (const position of event.snapshotPositions) {
      if (!partyKeys.has(position.partyRef)) throw new Error(`股权事件 ${event.key} 引用了未知主体 ${position.partyRef}`);
    }
    eventsByIssuer.set(event.issuerCompanyCode, [...(eventsByIssuer.get(event.issuerCompanyCode) ?? []), event]);
  }
  for (const code of managedIssuers) {
    const sourceEvents = eventsByIssuer.get(code) ?? [];
    if (sourceEvents.length === 0) throw new Error(`受管公司 ${code} 没有股权事件`);
    unique(sourceEvents.map((event) => String(event.sequence)), `公司 ${code} 股权事件序号`);
    const events: EquityLedgerEventState[] = sourceEvents.map((event, index) => ({
      id: index + 1,
      sequence: event.sequence,
      eventType: event.eventType,
      eventName: event.eventName,
      effectiveDate: asDate(event.effectiveDate),
      ledgerMode: event.ledgerMode,
      dataCompleteness: event.dataCompleteness,
      recordStatus: event.recordStatus,
      registeredCapitalCheckpointYuan: event.registeredCapitalCheckpointYuan,
      consolidatedByPartyIdAfter: event.consolidatedByPartyRefAfter === null ? null : partyId.get(event.consolidatedByPartyRefAfter)!,
      sourceLabel: event.sourceLabel,
      sourceReference: event.sourceReference,
      transactions: event.transactions.map((transaction, transactionIndex) => ({
        id: transactionIndex + 1,
        sequence: transaction.sequence,
        fromPartyId: transaction.fromPartyRef === null ? null : partyId.get(transaction.fromPartyRef)!,
        toPartyId: transaction.toPartyRef === null ? null : partyId.get(transaction.toPartyRef)!,
        registeredCapitalAmountYuan: transaction.registeredCapitalAmountYuan,
      })),
      snapshotPositions: event.snapshotPositions.map((position, positionIndex) => ({
        id: positionIndex + 1,
        sequence: position.sequence,
        partyId: partyId.get(position.partyRef)!,
        registeredCapitalAmountYuan: position.registeredCapitalAmountYuan,
        assertedShareRatio: position.assertedShareRatio,
      })),
    }));
    const state = projectEquityLedger(events, asDate(pack.baselineDate)!).confirmedState;
    if (state.holdings.size === 0) throw new Error(`公司 ${code} 在基准日没有有效股权关系`);
    if ([...state.holdings.values()].some((holding) => holding.shareRatio === null)) throw new Error(`公司 ${code} 当前已知股比存在空值`);
    const totalRatio = [...state.holdings.values()].reduce((sum, holding) => sum + (holding.shareRatio ?? 0), 0);
    if (state.dataCompleteness === "complete" && Math.abs(totalRatio - 1) > 0.0000001) {
      throw new Error(`公司 ${code} 当前股比合计不是100%：${totalRatio}`);
    }
    if (state.dataCompleteness !== "complete" && (totalRatio <= 0 || totalRatio > 1 + 0.0000001)) {
      throw new Error(`公司 ${code} 当前已知股比无效：${totalRatio}`);
    }
    if (state.consolidatedByPartyId === null) throw new Error(`公司 ${code} 当前没有并表控制方`);
  }
}

function validatePartialDate(value: string | null, precision: string, label: string) {
  if (value === null) {
    if (precision !== "unknown") throw new Error(`${label} 缺失时精度必须为 unknown`);
    return;
  }
  requireDate(value, label);
  if (precision === "unknown") throw new Error(`${label} 有值时精度不能为 unknown`);
}

function requireDate(value: string, label: string) {
  if (!DATE.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new Error(`${label} 格式无效`);
}

function asDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function unique(values: string[], label: string) {
  const duplicate = values.find((value, index) => !value || values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} 重复或为空：${duplicate || "<empty>"}`);
}
