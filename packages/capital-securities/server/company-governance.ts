import { authorize, type AuthorizeAction } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { invalidateCompanyCache } from "@workspace/platform/server/company-directory";
import {
  createParty,
  findPartyCandidates,
  resolvePartyIdentity,
} from "@workspace/platform/server/party-directory";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import type { CompanyRecord, OwnershipInterestRecord } from "../types";
import {
  buildCompanyCreateCommand,
  buildCompanyUpdateCommand,
} from "./domain/company-governance-validation";

type WriteCommand = { userId: number; body: Record<string, unknown> };
const RESOURCE_KEY = "capitalSecurities.governance";

class StaleCompanyError extends Error {}
class CompanyPartyConflictError extends Error {}

async function can(userId: number, action: AuthorizeAction) {
  return authorize({ user: userId, resourceKey: RESOURCE_KEY, action });
}

function mapCompanyWriteError(error: unknown) {
  if (error instanceof StaleCompanyError) return serviceError("公司或主体信息已发生变化，请刷新后重试", 409);
  if (error instanceof CompanyPartyConflictError) return serviceError("该法定主体已经是内部公司", 409);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    if (target.includes("identityNumber") || target.includes("subjectType")) {
      return serviceError("统一社会信用代码已属于其他主体", 409);
    }
    return serviceError("公司编码已存在", 409);
  }
  throw error;
}

export async function listCompanies(input: { keyword: string; activeOnly: boolean; page: number; pageSize: number }) {
  const companies = await prisma.company.findMany({
    where: input.activeOnly ? { isActive: true } : undefined,
    include: {
      party: true,
      registryChanges: {
        include: {
          ownershipParticipants: {
            include: { party: { select: { name: true, fullName: true } } },
            orderBy: [{ snapshotSide: "asc" }, { sequence: "asc" }],
          },
        },
        orderBy: [{ changeDate: "desc" }, { id: "desc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const mapped: CompanyRecord[] = companies.map((company) => ({
    id: company.id,
    partyId: company.partyId,
    partyVersion: company.party.version,
    code: company.code,
    name: company.party.name,
    fullName: company.party.fullName,
    description: company.description,
    registeredCapital: company.registeredCapital,
    unifiedCode: company.party.identityNumber.startsWith("TEMP-COMPANY-") ? null : company.party.identityNumber,
    bankName: company.bankName,
    registeredAddress: company.registeredAddress,
    registeredDate: company.registeredDate,
    legalPerson: company.party.legalRepresentative,
    managementGroup: company.managementGroup,
    codePoolCode: company.codePoolCode,
    isActive: company.isActive,
    sortOrder: company.sortOrder,
    version: company.version,
    registryChanges: company.registryChanges.map((change) => ({
      id: change.id,
      changeDate: formatDate(change.changeDate) ?? "",
      changeCategory: change.changeCategory as "company_name" | "legal_representative" | "officers" | "ownership",
      changeItem: change.changeItem,
      contentBefore: change.contentBefore,
      contentAfter: change.contentAfter,
      sourceCreatedDate: formatDate(change.sourceCreatedDate),
      ownershipParticipants: change.ownershipParticipants.map((participant) => ({
        id: participant.id,
        snapshotSide: participant.snapshotSide as "before" | "after",
        sequence: participant.sequence,
        partyId: participant.partyId,
        partyName: participant.party?.fullName || participant.party?.name || null,
        rawName: participant.rawName,
        normalizedName: participant.normalizedName,
        resolutionStatus: participant.resolutionStatus as "resolved" | "unresolved",
      })),
    })),
  }));
  const filtered = input.keyword
    ? mapped.filter((company) => matchSearchFields(company, input.keyword, ["code", "name", "fullName", "unifiedCode", "description"]))
    : mapped;
  const start = (input.page - 1) * input.pageSize;
  return { companies: filtered.slice(start, start + input.pageSize), total: filtered.length };
}

export async function createCompany(command: WriteCommand) {
  if (!(await can(command.userId, "create"))) return serviceError("无权限", 403);
  const validated = await buildCompanyCreateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  try {
    const record = await prisma.$transaction(async (tx) => {
      const existingParty = await resolvePartyIdentity(validated.data.identityData, tx);
      if (existingParty) {
        const existingCompany = await tx.company.findUnique({ where: { partyId: existingParty.id }, select: { id: true } });
        if (existingCompany) throw new CompanyPartyConflictError();
      }
      const party = existingParty ?? await createParty({ ...validated.data.identityData, editedBy: command.userId }, tx);
      if (!existingParty) await snapshotHistory("Party", party.id, command.userId, tx);
      const company = await tx.company.create({
        data: { ...validated.data.companyData, partyId: party.id, editedBy: command.userId },
      });
      await snapshotHistory("Company", company.id, command.userId, tx);
      return company;
    });
    invalidateCompanyCache();
    return serviceOk({ success: true, record: { id: record.id } });
  } catch (error) {
    return mapCompanyWriteError(error);
  }
}

export async function updateCompany(command: WriteCommand) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = await buildCompanyUpdateCommand(command.body);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.company.findUnique({ where: { id: validated.data.id }, select: { partyId: true } });
      if (!current) throw new StaleCompanyError();
      await ensureEditHistoryBaseline("Company", validated.data.id, command.userId, tx);
      await ensureEditHistoryBaseline("Party", current.partyId, command.userId, tx);
      const partyResult = await tx.party.updateMany({
        where: { id: current.partyId, version: validated.data.partyVersion },
        data: {
          ...validated.data.identityData,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const companyResult = await tx.company.updateMany({
        where: { id: validated.data.id, version: validated.data.version },
        data: {
          ...validated.data.companyData,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (partyResult.count !== 1 || companyResult.count !== 1) throw new StaleCompanyError();
      await snapshotHistory("Party", current.partyId, command.userId, tx);
      await snapshotHistory("Company", validated.data.id, command.userId, tx);
    });
    invalidateCompanyCache();
    return serviceOk({ success: true });
  } catch (error) {
    return mapCompanyWriteError(error);
  }
}

export async function listOwnershipInterests(input: { keyword: string; page: number; pageSize: number }) {
  const interests = await prisma.ownershipInterest.findMany({
    include: { owner: true, issuer: { include: { party: true } } },
    orderBy: [{ ownerPartyId: "asc" }, { issuerCompanyId: "asc" }, { effectiveFrom: "asc" }],
  });
  const mapped: OwnershipInterestRecord[] = interests.map((interest) => ({
    id: interest.id,
    ownerPartyId: interest.ownerPartyId,
    ownerName: interest.owner.name,
    issuerCompanyId: interest.issuerCompanyId,
    issuerCode: interest.issuer.code,
    issuerName: interest.issuer.party.name,
    shareRatio: interest.shareRatio,
    isConsolidated: interest.isConsolidated,
    effectiveFrom: formatDate(interest.effectiveFrom),
    effectiveTo: formatDate(interest.effectiveTo),
    recordStatus: interest.recordStatus as OwnershipInterestRecord["recordStatus"],
    changeLabel: interest.changeLabel,
    sourceType: interest.sourceType,
    sourceLabel: interest.sourceLabel,
    sourceReference: interest.sourceReference,
    version: interest.version,
  }));
  const filtered = input.keyword
    ? mapped.filter((interest) => matchSearchFields(interest, input.keyword, ["ownerName", "issuerName"]))
    : mapped;
  const start = (input.page - 1) * input.pageSize;
  return { interests: filtered.slice(start, start + input.pageSize), total: filtered.length };
}

export async function listOwnershipPartyCandidates(input: { keyword: string }) {
  const candidates = await findPartyCandidates({ keyword: input.keyword, limit: 30 });
  return {
    items: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      subtitle: `${candidate.subjectType === "individual" ? "个人" : "机构"} · ${candidate.identityNumberMasked}`,
      lifecycleStatus: "active" as const,
    })),
  };
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}
