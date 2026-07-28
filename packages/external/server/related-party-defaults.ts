import { normalizePartyName } from "@workspace/platform/server/party-name-history";
import { prisma } from "@workspace/platform/server/prisma";
import type { Prisma } from "@workspace/platform/server/prisma";
import type {
  ExternalPartyRelatedPartyType,
  ExternalRelatedParty,
} from "@workspace/external/types";

export interface SystemPartyRelatedPartyDefault {
  relatedPartyType: Exclude<ExternalPartyRelatedPartyType, "unrelated">;
  systemConfiguredReason: string;
}

export interface CoreManagementEmployeeSnapshot {
  id: number;
  name: string;
  idNumber: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelatedPartyDefaults {
  partyDefaults: Map<number, SystemPartyRelatedPartyDefault>;
  managementRows: ExternalRelatedParty[];
}

const GROUP_REASON = "内部公司由系统配置维护";
const OWNERSHIP_REASON = "股东及上层股东由资本证券台账维护";
const MANAGEMENT_REASON = "HR 在职核心人员，已通过 FK 关联财务辅助核算";

export function projectCoreManagementRelatedParties(
  employees: readonly CoreManagementEmployeeSnapshot[],
  asOfDate: string,
): ExternalRelatedParty[] {
  const employeeNameCounts = new Map<string, number>();
  for (const employee of employees) {
    const key = normalizePartyName(employee.name);
    employeeNameCounts.set(key, (employeeNameCounts.get(key) ?? 0) + 1);
  }
  return employees.flatMap((employee) => {
    const normalizedName = normalizePartyName(employee.name);
    if (employeeNameCounts.get(normalizedName) !== 1) return [];
    return [{
      id: employee.id,
      targetKind: "employee" as const,
      version: employee.version,
      subjectType: "individual" as const,
      relatedPartyType: "key_management_related" as const,
      name: employee.name,
      fullName: null,
      identityNumber: employee.idNumber,
      legalRepresentative: null,
      roles: [],
      systemConfigured: true,
      systemConfiguredReason: MANAGEMENT_REASON,
      asOfDate,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    }];
  });
}

function ownershipDateWhere(asOfDate: string): Prisma.OwnershipInterestWhereInput {
  const start = new Date(`${asOfDate}T00:00:00.000Z`);
  const end = new Date(`${asOfDate}T23:59:59.999Z`);
  return {
    recordStatus: "confirmed",
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: end } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }] },
    ],
  };
}

async function loadSystemPartyDefaults(asOfDate: string) {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, partyId: true },
  });
  const defaults = new Map<number, SystemPartyRelatedPartyDefault>();
  for (const company of companies) {
    defaults.set(company.partyId, {
      relatedPartyType: "group",
      systemConfiguredReason: GROUP_REASON,
    });
  }

  let companyFrontier = companies.map((company) => company.id);
  const queriedCompanies = new Set<number>();
  for (let depth = 0; depth < 2 && companyFrontier.length > 0; depth += 1) {
    const issuerCompanyIds = companyFrontier.filter((companyId) => !queriedCompanies.has(companyId));
    if (issuerCompanyIds.length === 0) break;
    issuerCompanyIds.forEach((companyId) => queriedCompanies.add(companyId));
    const interests = await prisma.ownershipInterest.findMany({
      where: {
        issuerCompanyId: { in: issuerCompanyIds },
        ...ownershipDateWhere(asOfDate),
      },
      select: {
        ownerPartyId: true,
        owner: { select: { company: { select: { id: true } } } },
      },
    });
    const nextCompanies = new Set<number>();
    for (const interest of interests) {
      if (!defaults.has(interest.ownerPartyId)) {
        defaults.set(interest.ownerPartyId, {
          relatedPartyType: "investor_influence",
          systemConfiguredReason: OWNERSHIP_REASON,
        });
      }
      if (interest.owner.company?.id && !queriedCompanies.has(interest.owner.company.id)) {
        nextCompanies.add(interest.owner.company.id);
      }
    }
    companyFrontier = [...nextCompanies];
  }
  return defaults;
}

async function loadCoreManagementRows(asOfDate: string) {
  const employees = await prisma.employee.findMany({
    where: {
      employments: { some: { isActive: true, personnelType: "核心人员" } },
      financeAuxiliaryMembers: { some: {} },
    },
    select: {
      id: true,
      name: true,
      idNumber: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return projectCoreManagementRelatedParties(employees, asOfDate);
}

export async function loadRelatedPartyDefaults(asOfDate: string): Promise<RelatedPartyDefaults> {
  const partyDefaults = await loadSystemPartyDefaults(asOfDate);
  const managementRows = await loadCoreManagementRows(asOfDate);
  return { partyDefaults, managementRows };
}
