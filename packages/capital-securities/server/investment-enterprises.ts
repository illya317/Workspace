import { authorize } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";

import type {
  InvestmentEnterpriseDocumentRecord,
  InvestmentEnterpriseProfileRecord,
  InvestmentEnterpriseWorkspace,
} from "../types/investment-enterprises";
import { callBusinessDocumentIntelligence } from "./business-document-intelligence-client";
import { getInvestorRelationshipView } from "./investor-relationships";
import {
  buildInvestmentEnterpriseCreateCommand,
  buildInvestmentEnterpriseRecordCommand,
  buildInvestmentEnterpriseUpdateCommand,
} from "./domain/investment-enterprise-validation";
import { findCompanyGovernanceReference } from "./company-reference-adapter";

const RESOURCE_KEY = "capitalSecurities.investments";
type WriteCommand = { userId: number; body: Record<string, unknown> };

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function number(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? null : value.toNumber();
}

function profileDto(profile: Prisma.InvestmentEnterpriseProfileGetPayload<{ include: { company: { include: { party: true } } } }>): InvestmentEnterpriseProfileRecord {
  return {
    id: profile.id, profileUid: profile.profileUid, companyId: profile.companyId, companyCode: profile.company.code,
    companyName: profile.company.party.name, companyFullName: profile.company.party.fullName, portfolioCode: profile.portfolioCode,
    investmentStatus: profile.investmentStatus, investmentStage: profile.investmentStage, industry: profile.industry,
    investmentDate: formatDate(profile.investmentDate), exitDate: formatDate(profile.exitDate), investmentCurrency: profile.investmentCurrency,
    investedAmount: number(profile.investedAmount), currentValuation: number(profile.currentValuation), valuationDate: formatDate(profile.valuationDate),
    investmentLead: profile.investmentLead, dealTeam: profile.dealTeam, boardSeat: profile.boardSeat, investmentThesis: profile.investmentThesis,
    keyRisks: profile.keyRisks, exitPlan: profile.exitPlan, nextReviewDate: formatDate(profile.nextReviewDate), version: profile.version,
  };
}

async function documentDtos(links: Array<{
  id: number; linkUid: string; profileId: number; libraryDocumentUid: string | null; documentCategory: string; title: string;
  notes: string | null; uploadStatus: string; failureReason: string | null; linkedAt: Date | null; updatedAt: Date;
}>, userId: number): Promise<InvestmentEnterpriseDocumentRecord[]> {
  const uids = links.flatMap((link) => link.libraryDocumentUid ? [link.libraryDocumentUid] : []);
  let statuses: Extract<Awaited<ReturnType<typeof callBusinessDocumentIntelligence>>, { operation: "status" }>["documents"] = [];
  if (uids.length) {
    try {
      const response = await callBusinessDocumentIntelligence({ operation: "status", requesterId: userId, resourceKey: RESOURCE_KEY, documentUids: uids });
      if (response.operation === "status") statuses = response.documents;
    } catch {
      statuses = [];
    }
  }
  const byUid = new Map(statuses.map((status) => [status.documentUid, status]));
  return links.map((link) => {
    const status = link.libraryDocumentUid ? byUid.get(link.libraryDocumentUid) : null;
    return {
      ...link,
      linkedAt: link.linkedAt?.toISOString() ?? null,
      documentId: status?.documentId ?? null,
      versionUid: status?.versionUid ?? null,
      fileName: status?.fileName ?? null,
      reviewStatus: status?.reviewStatus ?? null,
      extractionStatus: status?.extractionStatus ?? (link.uploadStatus === "failed" ? "failed" : "unavailable"),
      ocrStatus: status?.ocrStatus ?? "unavailable",
      vectorStatus: status?.vectorStatus ?? "unavailable",
      ocrUsed: status?.ocrUsed ?? false,
      modelKey: status?.modelKey ?? null,
      pageCount: status?.pageCount ?? null,
      updatedAt: status?.updatedAt ?? link.updatedAt.toISOString(),
    };
  });
}

export async function getInvestmentEnterpriseWorkspace(input: { userId: number; keyword: string; profileId: number | null }): Promise<InvestmentEnterpriseWorkspace> {
  const profiles = await prisma.investmentEnterpriseProfile.findMany({
    include: { company: { include: { party: true } } },
    orderBy: [{ investmentStatus: "asc" }, { portfolioCode: "asc" }],
  });
  const profileRows = profiles.map(profileDto);
  const filteredProfiles = input.keyword ? profileRows.filter((row) => matchSearchFields(row, input.keyword, ["portfolioCode", "companyCode", "companyName", "companyFullName", "industry", "investmentLead"])) : profileRows;
  const selected = profiles.find((item) => item.id === input.profileId) ?? profiles.find((item) => item.id === filteredProfiles[0]?.id) ?? null;
  const companies = await prisma.company.findMany({
    where: { isActive: true, investmentEnterpriseProfile: null }, include: { party: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  if (!selected) return {
    profiles: filteredProfiles, companyCandidates: companies.map((company) => ({ id: company.id, code: company.code, name: company.party.name, fullName: company.party.fullName })),
    selectedProfile: null, shareholders: [], meetings: [], diligenceItems: [], contracts: [], monitoring: [], documents: [],
    metrics: { openDiligence: 0, upcomingObligations: 0, pendingActions: 0, documentCount: 0 },
  };
  const [detail, investorView] = await Promise.all([
    prisma.investmentEnterpriseProfile.findUniqueOrThrow({
      where: { id: selected.id },
      include: {
        company: { include: { party: true } }, meetings: { orderBy: [{ meetingDate: "desc" }, { id: "desc" }] },
        diligenceItems: { orderBy: [{ riskLevel: "desc" }, { dueDate: "asc" }, { id: "desc" }] },
        contracts: { orderBy: [{ expiryDate: "asc" }, { id: "desc" }] }, monitoring: { orderBy: [{ periodEnd: "desc" }] },
        documentLinks: { orderBy: [{ createdAt: "desc" }] },
      },
    }),
    getInvestorRelationshipView({ issuerCompanyId: selected.companyId, asOf: workspaceBusinessDate(new Date()) }),
  ]);
  const documents = await documentDtos(detail.documentLinks, input.userId);
  const today = new Date(); const upcoming = new Date(today); upcoming.setUTCDate(upcoming.getUTCDate() + 30);
  return {
    profiles: filteredProfiles,
    companyCandidates: companies.map((company) => ({ id: company.id, code: company.code, name: company.party.name, fullName: company.party.fullName })),
    selectedProfile: profileDto(detail), shareholders: investorView.shareholders,
    meetings: detail.meetings.map((row) => ({ ...row, meetingDate: formatDate(row.meetingDate), followUpDueDate: formatDate(row.followUpDueDate) })),
    diligenceItems: detail.diligenceItems.map((row) => ({ ...row, dueDate: formatDate(row.dueDate) })),
    contracts: detail.contracts.map((row) => ({ ...row, signedDate: formatDate(row.signedDate), effectiveDate: formatDate(row.effectiveDate), expiryDate: formatDate(row.expiryDate), noticeDate: formatDate(row.noticeDate), amount: number(row.amount) })),
    monitoring: detail.monitoring.map((row) => ({ ...row, periodEnd: formatDate(row.periodEnd)!, revenue: number(row.revenue), netProfit: number(row.netProfit), cashBalance: number(row.cashBalance), valuation: number(row.valuation) })),
    documents,
    metrics: {
      openDiligence: detail.diligenceItems.filter((item) => !["closed", "accepted"].includes(item.status)).length,
      upcomingObligations: detail.contracts.filter((item) => item.noticeDate && item.noticeDate >= today && item.noticeDate <= upcoming).length,
      pendingActions: detail.meetings.filter((item) => item.followUpDueDate && item.status !== "closed").length,
      documentCount: documents.length,
    },
  };
}

async function can(userId: number, action: "create" | "update") {
  return authorize({ user: userId, resourceKey: RESOURCE_KEY, action });
}

export async function createInvestmentEnterprise(command: WriteCommand) {
  if (!(await can(command.userId, "create"))) return serviceError("无权限", 403);
  const validated = await buildInvestmentEnterpriseCreateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const company = await findCompanyGovernanceReference(validated.data.companyId);
  if (!company) return serviceError("公司不存在", 404);
  const existing = await prisma.investmentEnterpriseProfile.findUnique({ where: { companyId: validated.data.companyId }, select: { id: true } });
  if (existing) return serviceError("该公司已建立投资企业档案", 409);
  try {
    const record = await prisma.investmentEnterpriseProfile.create({ data: { companyId: validated.data.companyId, ...validated.data.data, editedBy: command.userId, editedAt: new Date() } });
    return serviceOk({ success: true, record: { id: record.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return serviceError("投资编号或公司档案已存在", 409);
    throw error;
  }
}

export async function updateInvestmentEnterprise(command: WriteCommand) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = await buildInvestmentEnterpriseUpdateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const result = await prisma.investmentEnterpriseProfile.updateMany({
    where: { id: validated.data.id, version: validated.data.version },
    data: { ...validated.data.data, editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  return result.count === 1 ? serviceOk({ success: true }) : serviceError("档案已发生变化，请刷新后重试", 409);
}

export async function saveInvestmentEnterpriseRecord(command: WriteCommand) {
  const validated = buildInvestmentEnterpriseRecordCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const action = validated.data.id === null ? "create" : "update";
  if (!(await can(command.userId, action))) return serviceError("无权限", 403);
  const parent = await prisma.investmentEnterpriseProfile.findUnique({ where: { id: validated.data.profileId }, select: { id: true } });
  if (!parent) return serviceError("投资企业档案不存在", 404);
  const audit = { editedBy: command.userId, editedAt: new Date() };
  const record = validated.data;
  const base = { id: record.id, expectedVersion: record.version, profileId: record.profileId, audit };
  if (record.kind === "meeting") return saveMeeting({ ...base, data: record.data });
  if (record.kind === "diligence") return saveDiligence({ ...base, data: record.data });
  if (record.kind === "contract") return saveContract({ ...base, data: record.data });
  return saveMonitoring({ ...base, data: record.data });
}

type SaveInput<T> = { id: number | null; expectedVersion: number | null; profileId: number; data: T; audit: { editedBy: number; editedAt: Date } };
type CreateRecordData<T> = Omit<T, "id" | "profileId" | "createdAt" | "updatedAt" | "editedBy" | "editedAt" | "version">;
async function saveMeeting(input: SaveInput<CreateRecordData<Prisma.InvestmentEnterpriseMeetingUncheckedCreateInput>>) {
  if (input.id === null) return serviceOk({ success: true, record: await prisma.investmentEnterpriseMeeting.create({ data: { ...input.data, profileId: input.profileId, ...input.audit } }) });
  const result = await prisma.investmentEnterpriseMeeting.updateMany({ where: { id: input.id, profileId: input.profileId, version: input.expectedVersion! }, data: { ...input.data, ...input.audit, version: { increment: 1 } } });
  return result.count === 1 ? serviceOk({ success: true }) : serviceError("会议记录已发生变化", 409);
}
async function saveDiligence(input: SaveInput<CreateRecordData<Prisma.InvestmentEnterpriseDiligenceItemUncheckedCreateInput>>) {
  if (input.id === null) return serviceOk({ success: true, record: await prisma.investmentEnterpriseDiligenceItem.create({ data: { ...input.data, profileId: input.profileId, ...input.audit } }) });
  const result = await prisma.investmentEnterpriseDiligenceItem.updateMany({ where: { id: input.id, profileId: input.profileId, version: input.expectedVersion! }, data: { ...input.data, ...input.audit, version: { increment: 1 } } });
  return result.count === 1 ? serviceOk({ success: true }) : serviceError("尽调记录已发生变化", 409);
}
async function saveContract(input: SaveInput<CreateRecordData<Prisma.InvestmentEnterpriseContractUncheckedCreateInput>>) {
  if (input.id === null) return serviceOk({ success: true, record: await prisma.investmentEnterpriseContract.create({ data: { ...input.data, profileId: input.profileId, ...input.audit } }) });
  const result = await prisma.investmentEnterpriseContract.updateMany({ where: { id: input.id, profileId: input.profileId, version: input.expectedVersion! }, data: { ...input.data, ...input.audit, version: { increment: 1 } } });
  return result.count === 1 ? serviceOk({ success: true }) : serviceError("合同记录已发生变化", 409);
}
async function saveMonitoring(input: SaveInput<CreateRecordData<Prisma.InvestmentEnterpriseMonitoringRecordUncheckedCreateInput>>) {
  if (input.id === null) return serviceOk({ success: true, record: await prisma.investmentEnterpriseMonitoringRecord.create({ data: { ...input.data, profileId: input.profileId, ...input.audit } }) });
  const result = await prisma.investmentEnterpriseMonitoringRecord.updateMany({ where: { id: input.id, profileId: input.profileId, version: input.expectedVersion! }, data: { ...input.data, ...input.audit, version: { increment: 1 } } });
  return result.count === 1 ? serviceOk({ success: true }) : serviceError("监控记录已发生变化", 409);
}
