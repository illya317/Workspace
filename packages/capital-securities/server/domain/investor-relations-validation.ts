import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

const INVESTOR_CATEGORIES = new Set([
  "founder",
  "employee_platform",
  "institutional",
  "strategic",
  "financial",
  "individual",
  "other",
]);
const RELATIONSHIP_STATUSES = new Set(["active", "priority", "monitoring", "dormant"]);
const DILIGENCE_TYPES = new Set(["comprehensive", "business", "financial", "legal", "technical", "hr", "esg", "other"]);
const VISIT_METHODS = new Set(["onsite", "remote", "hybrid"]);
const DILIGENCE_STATUSES = new Set(["planned", "in_progress", "completed", "cancelled"]);
const NDA_STATUSES = new Set(["not_required", "pending", "signed"]);
const DATA_ROOM_STATUSES = new Set(["not_opened", "open", "closed"]);

function positiveId(value: unknown, label: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? okCommand(parsed) : failCommand(`${label}无效`);
}

function nonnegativeVersion(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? okCommand(parsed) : failCommand("记录版本无效，请刷新后重试", 400, "version");
}

function nullableText(value: unknown, maxLength: number) {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const normalized = nullableText(value, maxLength);
  return normalized ? okCommand(normalized) : failCommand(`请填写${label}`, 400, label);
}

function enumValue(value: unknown, allowed: Set<string>, fallback: string, label: string) {
  const normalized = String(value ?? fallback);
  return allowed.has(normalized) ? okCommand(normalized) : failCommand(`${label}无效`, 400, label);
}

function requiredDate(value: unknown, label: string) {
  const normalized = nullableText(value, 10);
  if (!normalized) return failCommand(`请填写${label}`, 400, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00.000Z`).getTime())) {
    return failCommand(`${label}无效`, 400, label);
  }
  return okCommand(normalized);
}

function optionalDate(value: unknown, label: string) {
  const normalized = nullableText(value, 10);
  if (!normalized) return okCommand<string | null>(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00.000Z`).getTime())) {
    return failCommand(`${label}无效`, 400, label);
  }
  return okCommand<string | null>(normalized);
}

function optionalEmail(value: unknown) {
  const email = nullableText(value, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failCommand("邮箱格式无效", 400, "email");
  return okCommand(email);
}

export function buildInvestorShareholderProfileUpdateCommand(input: {
  issuerCompanyId: unknown;
  shareholderPartyId: unknown;
  expectedVersion: unknown;
  body: Record<string, unknown>;
}) {
  const issuerCompanyId = positiveId(input.issuerCompanyId, "公司ID");
  if (!issuerCompanyId.ok) return issuerCompanyId;
  const shareholderPartyId = positiveId(input.shareholderPartyId, "股东ID");
  if (!shareholderPartyId.ok) return shareholderPartyId;
  const expectedVersion = input.expectedVersion === null || input.expectedVersion === undefined
    ? okCommand<number | null>(null)
    : nonnegativeVersion(input.expectedVersion);
  if (!expectedVersion.ok) return expectedVersion;
  const investorCategory = input.body.investorCategory === null || input.body.investorCategory === ""
    ? okCommand<string | null>(null)
    : enumValue(input.body.investorCategory, INVESTOR_CATEGORIES, "other", "investorCategory");
  if (!investorCategory.ok) return investorCategory;
  const relationshipStatus = enumValue(input.body.relationshipStatus, RELATIONSHIP_STATUSES, "active", "relationshipStatus");
  if (!relationshipStatus.ok) return relationshipStatus;
  const email = optionalEmail(input.body.email);
  if (!email.ok) return email;
  return okCommand({
    issuerCompanyId: issuerCompanyId.data,
    shareholderPartyId: shareholderPartyId.data,
    expectedVersion: expectedVersion.data,
    data: {
      investorCategory: investorCategory.data,
      contactName: nullableText(input.body.contactName, 100),
      contactTitle: nullableText(input.body.contactTitle, 100),
      phone: nullableText(input.body.phone, 50),
      email: email.data,
      address: nullableText(input.body.address, 300),
      relationshipOwner: nullableText(input.body.relationshipOwner, 100),
      relationshipStatus: relationshipStatus.data,
      communicationPreference: nullableText(input.body.communicationPreference, 200),
      notes: nullableText(input.body.notes, 3000),
    },
  });
}

export function buildInvestorDueDiligenceCreateCommand(input: {
  issuerCompanyId: unknown;
  idempotencyKey: string;
  body: Record<string, unknown>;
}) {
  return buildDueDiligenceCommand({ ...input, id: null, expectedVersion: null });
}

export function buildInvestorDueDiligenceUpdateCommand(input: {
  id: unknown;
  issuerCompanyId: unknown;
  expectedVersion: unknown;
  body: Record<string, unknown>;
}) {
  return buildDueDiligenceCommand({ ...input, idempotencyKey: null });
}

function buildDueDiligenceCommand(input: {
  id: unknown;
  issuerCompanyId: unknown;
  expectedVersion: unknown;
  idempotencyKey: string | null;
  body: Record<string, unknown>;
}) {
  const id = input.id === null ? okCommand<number | null>(null) : positiveId(input.id, "尽调记录ID");
  if (!id.ok) return id;
  const issuerCompanyId = positiveId(input.issuerCompanyId, "公司ID");
  if (!issuerCompanyId.ok) return issuerCompanyId;
  const expectedVersion = input.expectedVersion === null
    ? okCommand<number | null>(null)
    : nonnegativeVersion(input.expectedVersion);
  if (!expectedVersion.ok) return expectedVersion;
  const investorPartyId = input.body.investorPartyId === null || input.body.investorPartyId === undefined || input.body.investorPartyId === ""
    ? okCommand<number | null>(null)
    : positiveId(input.body.investorPartyId, "关联股东ID");
  if (!investorPartyId.ok) return investorPartyId;
  const investorOrganization = requiredText(input.body.investorOrganization, "投资机构", 200);
  if (!investorOrganization.ok) return investorOrganization;
  const visitorName = requiredText(input.body.visitorName, "尽调人员", 100);
  if (!visitorName.ok) return visitorName;
  const diligenceDate = requiredDate(input.body.diligenceDate, "尽调日期");
  if (!diligenceDate.ok) return diligenceDate;
  const nextFollowUpDate = optionalDate(input.body.nextFollowUpDate, "下次跟进日期");
  if (!nextFollowUpDate.ok) return nextFollowUpDate;
  const diligenceType = enumValue(input.body.diligenceType, DILIGENCE_TYPES, "comprehensive", "diligenceType");
  if (!diligenceType.ok) return diligenceType;
  const visitMethod = enumValue(input.body.visitMethod, VISIT_METHODS, "onsite", "visitMethod");
  if (!visitMethod.ok) return visitMethod;
  const status = enumValue(input.body.status, DILIGENCE_STATUSES, "planned", "status");
  if (!status.ok) return status;
  const ndaStatus = enumValue(input.body.ndaStatus, NDA_STATUSES, "pending", "ndaStatus");
  if (!ndaStatus.ok) return ndaStatus;
  const dataRoomStatus = enumValue(input.body.dataRoomStatus, DATA_ROOM_STATUSES, "not_opened", "dataRoomStatus");
  if (!dataRoomStatus.ok) return dataRoomStatus;
  const email = optionalEmail(input.body.email);
  if (!email.ok) return email;
  return okCommand({
    id: id.data,
    issuerCompanyId: issuerCompanyId.data,
    expectedVersion: expectedVersion.data,
    idempotencyKey: input.idempotencyKey,
    data: {
      investorPartyId: investorPartyId.data,
      investorOrganization: investorOrganization.data,
      visitorName: visitorName.data,
      visitorTitle: nullableText(input.body.visitorTitle, 100),
      phone: nullableText(input.body.phone, 50),
      email: email.data,
      diligenceDate: new Date(`${diligenceDate.data}T00:00:00.000Z`),
      diligenceType: diligenceType.data,
      visitMethod: visitMethod.data,
      status: status.data,
      hostName: nullableText(input.body.hostName, 100),
      ndaStatus: ndaStatus.data,
      dataRoomStatus: dataRoomStatus.data,
      focusAreas: nullableText(input.body.focusAreas, 3000),
      followUpAction: nullableText(input.body.followUpAction, 3000),
      nextFollowUpDate: nextFollowUpDate.data ? new Date(`${nextFollowUpDate.data}T00:00:00.000Z`) : null,
      notes: nullableText(input.body.notes, 3000),
    },
  });
}

export function buildInvestorDueDiligenceArchiveCommand(input: {
  id: unknown;
  expectedVersion: unknown;
}) {
  const id = positiveId(input.id, "尽调记录ID");
  if (!id.ok) return id;
  const expectedVersion = nonnegativeVersion(input.expectedVersion);
  if (!expectedVersion.ok) return expectedVersion;
  return okCommand({ id: id.data, expectedVersion: expectedVersion.data });
}
