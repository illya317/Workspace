#!/usr/bin/env node
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { recordPartyLegalFactInTransaction } from "@workspace/platform/server/party-legal-facts";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

const INPUT_KIND = "finance-auxiliary-identity-link-repair";
const MARKER_PREFIX = "data.repair.finance.auxiliary-identities.";

type IdentityTargetKind = "employee" | "party";

export interface AuxiliaryIdentityMemberSnapshot {
  id: number;
  dimensionType: string;
  sourceName: string;
  shortName: string | null;
  linkedCompanyId: number | null;
  linkedEmployeeId: number | null;
  linkedPartyId: number | null;
}

export interface AuxiliaryIdentityEmployeeSnapshot {
  id: number;
  name: string;
}

export interface AuxiliaryIdentityPartySnapshot {
  id: number;
  subjectType: string;
  identityNumber: string;
  name: string;
  fullName: string | null;
  externalRoles: readonly {
    category: string;
    sourceMappings: readonly { sourceName: string }[];
  }[];
}

export interface ResolvedAuxiliaryIdentityTarget {
  memberId: number;
  targetKind: IdentityTargetKind;
  targetId: number;
  method: string;
  evidence: string;
}

export interface AuxiliaryIdentityResolution {
  resolved: ResolvedAuxiliaryIdentityTarget[];
  unresolvedPersonMemberIds: number[];
  unresolvedCustomerSupplierMemberIds: number[];
}

interface ManualEmployeePartyLinkInput {
  employeeId: number;
  partyId: number;
  expectedName: string;
  useEmployeeIdentityNumber: boolean;
}

interface RepairInput {
  schemaVersion: 1;
  kind: typeof INPUT_KIND;
  repairKey: string;
  actorUserId: number;
  asOfDate: string;
  manualEmployeePartyLinks: ManualEmployeePartyLinkInput[];
  expected: {
    automaticEmployeePartyLinks: number;
    manualEmployeePartyLinks: number;
    auxiliaryEmployeeLinks: number;
    auxiliaryPartyLinks: number;
    unresolvedPersonMembers: number;
    unresolvedCustomerSupplierMembers: number;
  };
}

function fail(message: string): never {
  throw new Error(message);
}

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function addCandidate(index: Map<string, Set<number>>, key: string, id: number) {
  if (!key) return;
  const candidates = index.get(key) ?? new Set<number>();
  candidates.add(id);
  index.set(key, candidates);
}

function uniqueTarget(index: Map<string, Set<number>>, names: readonly (string | null)[]) {
  const candidates = new Set<number>();
  for (const name of names) {
    for (const id of index.get(normalized(name)) ?? []) candidates.add(id);
  }
  return candidates.size === 1 ? [...candidates][0] ?? null : null;
}

export function resolveAuxiliaryIdentityTargets(input: {
  members: readonly AuxiliaryIdentityMemberSnapshot[];
  employees: readonly AuxiliaryIdentityEmployeeSnapshot[];
  parties: readonly AuxiliaryIdentityPartySnapshot[];
}): AuxiliaryIdentityResolution {
  const employeeNames = new Map<string, Set<number>>();
  for (const employee of input.employees) addCandidate(employeeNames, normalized(employee.name), employee.id);

  const individualPartyNames = new Map<string, Set<number>>();
  const rolePartyNames = new Map<string, Map<string, Set<number>>>([
    ["customer", new Map()],
    ["supplier", new Map()],
  ]);
  for (const party of input.parties) {
    if (party.subjectType === "individual" && !party.identityNumber.startsWith("TEMP-")) {
      addCandidate(individualPartyNames, normalized(party.name), party.id);
      addCandidate(individualPartyNames, normalized(party.fullName), party.id);
    }
    for (const role of party.externalRoles) {
      const index = rolePartyNames.get(role.category);
      if (!index) continue;
      addCandidate(index, normalized(party.name), party.id);
      addCandidate(index, normalized(party.fullName), party.id);
      for (const mapping of role.sourceMappings) addCandidate(index, normalized(mapping.sourceName), party.id);
    }
  }

  const resolved: ResolvedAuxiliaryIdentityTarget[] = [];
  const unresolvedPersonMemberIds: number[] = [];
  const unresolvedCustomerSupplierMemberIds: number[] = [];
  for (const member of input.members) {
    if (member.linkedCompanyId || member.linkedEmployeeId || member.linkedPartyId) continue;
    const names = [member.sourceName, member.shortName];
    if (member.dimensionType === "person") {
      const employeeId = uniqueTarget(employeeNames, names);
      if (employeeId) {
        resolved.push({
          memberId: member.id,
          targetKind: "employee",
          targetId: employeeId,
          method: "unique_employee_name",
          evidence: "财务个人辅助名称在员工目录中唯一匹配",
        });
        continue;
      }
      const partyId = uniqueTarget(individualPartyNames, names);
      if (partyId) {
        resolved.push({
          memberId: member.id,
          targetKind: "party",
          targetId: partyId,
          method: "unique_individual_party_name",
          evidence: "财务个人辅助名称在已确认个人 Party 中唯一匹配",
        });
        continue;
      }
      unresolvedPersonMemberIds.push(member.id);
      continue;
    }
    if (member.dimensionType === "customer" || member.dimensionType === "supplier") {
      const partyId = uniqueTarget(rolePartyNames.get(member.dimensionType) ?? new Map(), names);
      if (partyId) {
        resolved.push({
          memberId: member.id,
          targetKind: "party",
          targetId: partyId,
          method: "unique_external_role_name",
          evidence: `财务${member.dimensionType === "customer" ? "客户" : "供应商"}名称在对应 External 角色中唯一匹配`,
        });
      } else {
        unresolvedCustomerSupplierMemberIds.push(member.id);
      }
    }
  }
  return { resolved, unresolvedPersonMemberIds, unresolvedCustomerSupplierMemberIds };
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

export function validateFinanceAuxiliaryIdentityLinkRepairInput(value: unknown): RepairInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("repair input must be an object");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "actorUserId,asOfDate,expected,kind,manualEmployeePartyLinks,repairKey,schemaVersion"
    || input.schemaVersion !== 1 || input.kind !== INPUT_KIND
    || typeof input.repairKey !== "string" || !/^[a-z0-9][a-z0-9._-]{2,100}$/.test(input.repairKey)
    || !positiveInteger(input.actorUserId) || typeof input.asOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)
    || !Array.isArray(input.manualEmployeePartyLinks) || input.manualEmployeePartyLinks.length > 100
    || !input.expected || typeof input.expected !== "object" || Array.isArray(input.expected)) {
    fail("finance auxiliary identity link repair input is invalid");
  }
  const expected = input.expected as Record<string, unknown>;
  if (Object.keys(expected).sort().join(",") !== "automaticEmployeePartyLinks,auxiliaryEmployeeLinks,auxiliaryPartyLinks,manualEmployeePartyLinks,unresolvedCustomerSupplierMembers,unresolvedPersonMembers"
    || Object.values(expected).some((count) => !Number.isInteger(count) || Number(count) < 0)) {
    fail("finance auxiliary identity link expected counts are invalid");
  }
  const pairs = new Set<string>();
  for (const rowValue of input.manualEmployeePartyLinks) {
    if (!rowValue || typeof rowValue !== "object" || Array.isArray(rowValue)) fail("manual identity link row is invalid");
    const row = rowValue as Record<string, unknown>;
    if (Object.keys(row).sort().join(",") !== "employeeId,expectedName,partyId,useEmployeeIdentityNumber"
      || !positiveInteger(row.employeeId) || !positiveInteger(row.partyId)
      || typeof row.expectedName !== "string" || !row.expectedName.trim()
      || typeof row.useEmployeeIdentityNumber !== "boolean") {
      fail("manual identity link row is invalid");
    }
    const key = `${row.employeeId}:${row.partyId}`;
    if (pairs.has(key)) fail("manual identity link rows contain a duplicate");
    pairs.add(key);
  }
  return input as unknown as RepairInput;
}

function countTargets(resolution: AuxiliaryIdentityResolution, targetKind: IdentityTargetKind) {
  return resolution.resolved.filter((item) => item.targetKind === targetKind).length;
}

async function repairFinanceAuxiliaryIdentityLinks(input: RepairInput) {
  const markerKey = `${MARKER_PREFIX}${input.repairKey}`;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${markerKey})) IS NULL AS "locked"`;
    const existingMarker = await tx.systemConfig.findUnique({ where: { key: markerKey } });
    if (existingMarker) return JSON.parse(existingMarker.value) as Record<string, unknown>;

    const employees = await tx.employee.findMany({ select: { id: true, name: true, idNumber: true } });
    const parties = await tx.party.findMany({
        include: {
          legalFactRevisions: { orderBy: { revision: "asc" } },
          company: true,
          externalRoles: { include: { sourceMappings: true } },
        },
      });
    const members = await tx.financeAuxiliaryMember.findMany({
        select: {
          id: true,
          dimensionType: true,
          sourceName: true,
          shortName: true,
          linkedCompanyId: true,
          linkedEmployeeId: true,
          linkedPartyId: true,
        },
      });

    const manualEmployeeIds = new Set(input.manualEmployeePartyLinks.map((row) => row.employeeId));
    const manualPartyIds = new Set(input.manualEmployeePartyLinks.map((row) => row.partyId));
    const partiesByIdentity = new Map<string, typeof parties>();
    for (const party of parties) {
      const key = normalized(party.identityNumber);
      if (!key || party.identityNumber.startsWith("TEMP-")) continue;
      const rows = partiesByIdentity.get(key) ?? [];
      rows.push(party);
      partiesByIdentity.set(key, rows);
    }
    const automaticLinks = employees.flatMap((employee) => {
      if (!employee.idNumber || manualEmployeeIds.has(employee.id)) return [];
      const matches = partiesByIdentity.get(normalized(employee.idNumber)) ?? [];
      if (matches.length !== 1 || manualPartyIds.has(matches[0]!.id)) return [];
      return [{ employeeId: employee.id, partyId: matches[0]!.id }];
    });
    if (automaticLinks.length !== input.expected.automaticEmployeePartyLinks) {
      fail(`expected ${input.expected.automaticEmployeePartyLinks} automatic employee Party links, received ${automaticLinks.length}`);
    }
    if (input.manualEmployeePartyLinks.length !== input.expected.manualEmployeePartyLinks) {
      fail("manual employee Party link count changed");
    }

    for (const requested of input.manualEmployeePartyLinks) {
      const employee = employees.find((row) => row.id === requested.employeeId);
      const party = parties.find((row) => row.id === requested.partyId);
      if (!employee || !party || employee.name !== requested.expectedName || party.name !== requested.expectedName) {
        fail(`manual employee Party link ${requested.employeeId}:${requested.partyId} no longer matches the reviewed name`);
      }
      const desiredIdentity = requested.useEmployeeIdentityNumber
        ? employee.idNumber?.trim() || fail(`${requested.expectedName} is missing the reviewed employee identity number`)
        : party.identityNumber;
      const authoritative = party.legalFactRevisions
        .filter((revision) => revision.recordState === "confirmed")
        .at(-1) ?? fail(`${requested.expectedName} is missing a legal fact baseline`);
      if (authoritative.subjectType !== "individual" || authoritative.identityNumber !== desiredIdentity) {
        await recordPartyLegalFactInTransaction({
          partyId: party.id,
          userId: input.actorUserId,
          asOfDate: input.asOfDate,
          expectedRevision: Math.max(...party.legalFactRevisions.map((revision) => revision.revision)),
          idempotencyKey: `finance-aux-identity:${input.repairKey}:party:${party.id}`,
          command: {
            kind: "correction",
            supersedesId: authoritative.id,
            snapshot: {
              subjectType: "individual",
              name: party.name,
              fullName: party.fullName,
              identityNumber: desiredIdentity,
              legalRepresentative: party.legalRepresentative,
              registeredCapital: party.company?.registeredCapital ?? null,
              registeredAddress: party.company?.registeredAddress ?? null,
              registeredDate: party.company?.registeredDate ?? null,
            },
            reason: requested.useEmployeeIdentityNumber
              ? "更正个人供应商主体类型并采用已确认员工证件号"
              : "更正个人供应商主体类型；员工证件号待补",
          },
          sourceType: "governed-data-repair",
          sourceLabel: "财务辅助核算身份关联",
          sourceReference: input.repairKey,
        }, tx);
      }
    }

    for (const link of automaticLinks) {
      await tx.employeePartyIdentityLink.create({
        data: {
          ...link,
          linkMethod: "identity_number",
          linkEvidence: "员工证件号与 Party 证件号完全一致",
          confirmedBy: input.actorUserId,
        },
      });
    }
    for (const link of input.manualEmployeePartyLinks) {
      await tx.employeePartyIdentityLink.create({
        data: {
          employeeId: link.employeeId,
          partyId: link.partyId,
          linkMethod: "user_confirmed",
          linkEvidence: link.useEmployeeIdentityNumber
            ? "用户确认同一自然人，并采用员工证件号更正 Party"
            : "用户确认同一自然人；Party 暂用临时身份号待补证件",
          confirmedBy: input.actorUserId,
        },
      });
    }

    const refreshedParties = await tx.party.findMany({
      select: {
        id: true,
        subjectType: true,
        identityNumber: true,
        name: true,
        fullName: true,
        externalRoles: { select: { category: true, sourceMappings: { select: { sourceName: true } } } },
      },
    });
    const resolution = resolveAuxiliaryIdentityTargets({ members, employees, parties: refreshedParties });
    const employeeLinkCount = countTargets(resolution, "employee");
    const partyLinkCount = countTargets(resolution, "party");
    if (employeeLinkCount !== input.expected.auxiliaryEmployeeLinks
      || partyLinkCount !== input.expected.auxiliaryPartyLinks
      || resolution.unresolvedPersonMemberIds.length !== input.expected.unresolvedPersonMembers
      || resolution.unresolvedCustomerSupplierMemberIds.length !== input.expected.unresolvedCustomerSupplierMembers) {
      fail(`auxiliary identity resolution drifted: ${JSON.stringify({
        employeeLinkCount,
        partyLinkCount,
        unresolvedPersonMembers: resolution.unresolvedPersonMemberIds.length,
        unresolvedCustomerSupplierMembers: resolution.unresolvedCustomerSupplierMemberIds.length,
      })}`);
    }
    for (const target of resolution.resolved) {
      await tx.financeAuxiliaryMember.update({
        where: { id: target.memberId },
        data: {
          linkedEmployeeId: target.targetKind === "employee" ? target.targetId : null,
          linkedPartyId: target.targetKind === "party" ? target.targetId : null,
          identityLinkMethod: target.method,
          identityLinkEvidence: target.evidence,
          identityLinkedAt: new Date(),
          identityLinkedBy: input.actorUserId,
        },
      });
    }

    const receipt = {
      completed: true,
      repairKey: input.repairKey,
      automaticEmployeePartyLinks: automaticLinks.length,
      manualEmployeePartyLinks: input.manualEmployeePartyLinks.length,
      auxiliaryEmployeeLinks: employeeLinkCount,
      auxiliaryPartyLinks: partyLinkCount,
      unresolvedPersonMembers: resolution.unresolvedPersonMemberIds.length,
      unresolvedCustomerSupplierMembers: resolution.unresolvedCustomerSupplierMemberIds.length,
      completedAt: new Date().toISOString(),
    };
    await tx.systemConfig.create({ data: { key: markerKey, value: JSON.stringify(receipt) } });
    return receipt;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}

async function main() {
  if (!process.argv.includes("--execute")) fail("repair requires --execute through the governed data-release handler");
  const inputFile = process.argv.find((argument) => argument.startsWith("--input-file="))?.slice(13);
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) {
    fail("repair requires --input-file=<absolute-file>");
  }
  const input = validateFinanceAuxiliaryIdentityLinkRepairInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const result = await repairFinanceAuxiliaryIdentityLinks(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
