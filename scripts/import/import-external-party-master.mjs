#!/usr/bin/env node
/**
 * 将旧 ERP 客户/供应商档案导入 Party + ExternalPartyRole，并按唯一名称映射发货客户。
 * 默认只输出计划；只有显式传入 --execute 才会写库。
 *
 * Usage:
 *   node --import tsx scripts/import/import-external-party-master.mjs \
 *     --company-code=04 --customer-file=/path/客户档案.XLS \
 *     --supplier-file=/path/供应商档案.XLS
 *   node --import tsx scripts/import/import-external-party-master.mjs \
 *     --company-code=04 --customer-file=/path/客户档案.XLS \
 *     --supplier-file=/path/供应商档案.XLS \
 *     --expected-database=workspace_pg --expected-shipment-rows=4999 \
 *     --expected-customer-roles=0 --expected-supplier-roles=0 \
 *     --expected-source-mappings=0 \
 *     --customer-sha256=<sha256> --supplier-sha256=<sha256> \
 *     --require-empty-master --execute
 */

import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireDatabaseUrl } from "../lib/database-url.js";
import {
  aliasesForRecord,
  archiveRoleCode,
  normalizeExternalPartyName,
  parseExternalPartyMasterWorkbook,
  stableProvisionalCode,
  temporaryArchiveIdentity,
  temporarySharedIdentity,
  temporaryShipmentIdentity,
} from "./external-party-master-source.mjs";

const { PrismaClient } = await import("../../generated/prisma/client.ts");

function argument(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const companyCode = argument("company-code");
const customerFile = argument("customer-file");
const supplierFile = argument("supplier-file");
const expectedDatabase = argument("expected-database");
const expectedCustomerSha256 = argument("customer-sha256")?.toLowerCase();
const expectedSupplierSha256 = argument("supplier-sha256")?.toLowerCase();
const expectedShipmentRowsText = argument("expected-shipment-rows");
const expectedCustomerRolesText = argument("expected-customer-roles");
const expectedSupplierRolesText = argument("expected-supplier-roles");
const expectedSourceMappingsText = argument("expected-source-mappings");
const execute = process.argv.includes("--execute");
const requireEmptyMaster = process.argv.includes("--require-empty-master");

function requireArgument(value, label) {
  if (!value) throw new Error(`缺少 --${label}=...`);
  return value;
}

function assertReadable(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label}不存在：${filePath}`);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function requiredExpectedCount(name, valueText) {
  if (valueText === undefined) throw new Error(`执行写入必须提供 --${name}=...`);
  const value = Number(valueText);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} 必须是非负整数`);
  return value;
}

function verifyExecutePreflight(preflight) {
  if (!expectedDatabase) throw new Error("执行写入必须提供 --expected-database=...");
  if (!expectedCustomerSha256 || !expectedSupplierSha256) {
    throw new Error("执行写入必须提供 --customer-sha256 和 --supplier-sha256");
  }
  const expectedRows = requiredExpectedCount("expected-shipment-rows", expectedShipmentRowsText);
  const expectedCustomerRoles = requiredExpectedCount("expected-customer-roles", expectedCustomerRolesText);
  const expectedSupplierRoles = requiredExpectedCount("expected-supplier-roles", expectedSupplierRolesText);
  const expectedSourceMappings = requiredExpectedCount("expected-source-mappings", expectedSourceMappingsText);
  if (preflight.database !== expectedDatabase) {
    throw new Error(`数据库不匹配：实际 ${preflight.database}，预期 ${expectedDatabase}`);
  }
  if (preflight.customerSha256 !== expectedCustomerSha256) throw new Error("客户档案 SHA-256 不匹配");
  if (preflight.supplierSha256 !== expectedSupplierSha256) throw new Error("供应商档案 SHA-256 不匹配");
  if (preflight.shipmentRows !== expectedRows) {
    throw new Error(`发货行数不匹配：实际 ${preflight.shipmentRows}，预期 ${expectedRows}`);
  }
  if (preflight.customerRoles !== expectedCustomerRoles) {
    throw new Error(`客户角色基线不匹配：实际 ${preflight.customerRoles}，预期 ${expectedCustomerRoles}`);
  }
  if (preflight.supplierRoles !== expectedSupplierRoles) {
    throw new Error(`供应商角色基线不匹配：实际 ${preflight.supplierRoles}，预期 ${expectedSupplierRoles}`);
  }
  if (preflight.sourceMappings !== expectedSourceMappings) {
    throw new Error(`来源映射基线不匹配：实际 ${preflight.sourceMappings}，预期 ${expectedSourceMappings}`);
  }
  if (
    requireEmptyMaster
    && (preflight.customerRoles !== 0 || preflight.supplierRoles !== 0 || preflight.sourceMappings !== 0)
  ) {
    throw new Error("--require-empty-master 要求客户、供应商和来源映射均为空");
  }
}

function roleFields(record) {
  return {
    contactPerson: record.contactPerson,
    phone: record.phone ?? record.sourceData.mobile ?? null,
    address: record.address,
    taxRate: record.taxRate,
  };
}

function mappingFields(record, companyId) {
  return {
    companyId,
    sourceSystem: record.sourceSystem,
    sourceKey: record.sourceKey,
    sourceCode: record.sourceCode,
    sourceName: record.sourceName,
    sourceNameNormalized: record.sourceNameNormalized,
    sourceFile: record.sourceFile,
    sourceSheet: record.sourceSheet,
    sourceRow: record.sourceRow,
    sourceData: record.sourceData,
  };
}

function addCandidate(index, alias, candidate) {
  if (!alias) return;
  const candidates = index.get(alias) ?? new Map();
  candidates.set(candidate.key, candidate);
  index.set(alias, candidates);
}

function dualRolePlan(customers, suppliers) {
  const byLegalName = (records) => {
    const index = new Map();
    for (const record of records) {
      const key = normalizeExternalPartyName(record.legalName);
      index.set(key, [...(index.get(key) ?? []), record]);
    }
    return index;
  };
  const customerLegalNames = byLegalName(customers);
  const supplierLegalNames = byLegalName(suppliers);
  const exactPairs = [];
  for (const [name, customerMatches] of customerLegalNames) {
    const supplierMatches = supplierLegalNames.get(name) ?? [];
    if (customerMatches.length === 1 && supplierMatches.length === 1) {
      exactPairs.push({ legalName: customerMatches[0].legalName, customer: customerMatches[0], supplier: supplierMatches[0] });
    }
  }
  const customerAliases = new Set(customers.flatMap(aliasesForRecord));
  const supplierAliases = new Set(suppliers.flatMap(aliasesForRecord));
  const exactNames = new Set(exactPairs.map((pair) => normalizeExternalPartyName(pair.legalName)));
  const aliasOnly = [...customerAliases].filter((alias) => supplierAliases.has(alias) && !exactNames.has(alias));
  return { exactPairs, aliasOnly };
}

function sourcePlan(customers, suppliers, shipmentGroups, existingShipmentSourceKeys, crossRole) {
  const archiveAliases = new Map();
  for (const record of customers) {
    for (const alias of aliasesForRecord(record)) {
      addCandidate(archiveAliases, alias, { key: record.sourceKey, record });
    }
  }
  let matchedArchive = 0;
  let existingMappings = 0;
  let provisional = 0;
  let ambiguous = 0;
  let matchedRows = 0;
  let existingMappedRows = 0;
  let provisionalRows = 0;
  let ambiguousRows = 0;
  for (const group of shipmentGroups) {
    const normalized = normalizeExternalPartyName(group.customerName);
    if (existingShipmentSourceKeys.has(`name:${normalized}`)) {
      existingMappings += 1;
      existingMappedRows += group.count;
      continue;
    }
    const matches = archiveAliases.get(normalized);
    if (!matches?.size) {
      provisional += 1;
      provisionalRows += group.count;
    } else if (matches.size === 1) {
      matchedArchive += 1;
      matchedRows += group.count;
    } else {
      ambiguous += 1;
      ambiguousRows += group.count;
    }
  }
  return {
    customerArchiveRows: customers.length,
    supplierArchiveRows: suppliers.length,
    exactDualRoleSubjects: crossRole.exactPairs.length,
    aliasOnlyCrossRoleCandidates: crossRole.aliasOnly.length,
    shipmentCustomerNames: shipmentGroups.length,
    matchedArchive,
    matchedRows,
    existingMappings,
    existingMappedRows,
    provisional,
    provisionalRows,
    ambiguous,
    ambiguousRows,
  };
}

async function consolidateDualRoles(tx, company, pairs, counters) {
  for (const pair of pairs) {
    const lookup = (record) => tx.externalPartySourceMapping.findUnique({
      where: {
        companyId_sourceSystem_sourceKey: {
          companyId: company.id,
          sourceSystem: record.sourceSystem,
          sourceKey: record.sourceKey,
        },
      },
      include: {
        role: {
          include: {
            party: {
              include: {
                externalRoles: true,
                company: { select: { id: true } },
                _count: { select: { ownedInterests: true } },
              },
            },
          },
        },
      },
    });
    const [customerMapping, supplierMapping] = await Promise.all([lookup(pair.customer), lookup(pair.supplier)]);
    if (!customerMapping || !supplierMapping) throw new Error(`双角色来源映射缺失：${pair.legalName}`);
    const customerParty = customerMapping.role.party;
    const supplierParty = supplierMapping.role.party;
    const realIdentities = [customerParty.identityNumber, supplierParty.identityNumber]
      .filter((identity) => !identity.startsWith("TEMP-"));
    if (new Set(realIdentities).size > 1) {
      counters.dualRoleConflicts += 1;
      continue;
    }
    const identityNumber = realIdentities[0] ?? temporarySharedIdentity(company.code, pair.legalName);
    if (customerParty.id === supplierParty.id) {
      await tx.party.update({
        where: { id: customerParty.id },
        data: { name: pair.legalName, fullName: null, identityNumber },
      });
      counters.existingDualRoleSubjects += 1;
      continue;
    }
    if (
      customerParty.externalRoles.some((role) => role.category === "supplier")
      || supplierParty.externalRoles.some((role) => role.category === "customer")
      || supplierParty.company
      || supplierParty._count.ownedInterests > 0
    ) {
      counters.dualRoleConflicts += 1;
      continue;
    }
    await tx.externalPartyRole.update({
      where: { id: supplierMapping.roleId },
      data: { partyId: customerParty.id },
    });
    await tx.externalPartyProfile.deleteMany({ where: { partyId: supplierParty.id } });
    await tx.party.delete({ where: { id: supplierParty.id } });
    await tx.party.update({
      where: { id: customerParty.id },
      data: { name: pair.legalName, fullName: null, identityNumber },
    });
    counters.dualRoleMerged += 1;
  }
}

async function upsertArchiveRecord(tx, company, record, counters) {
  const temporaryIdentity = temporaryArchiveIdentity(record.category, company.code, record.sourceCode);
  const uniqueKey = {
    companyId_sourceSystem_sourceKey: {
      companyId: company.id,
      sourceSystem: record.sourceSystem,
      sourceKey: record.sourceKey,
    },
  };
  const existing = await tx.externalPartySourceMapping.findUnique({
    where: uniqueKey,
    include: { role: { include: { party: true } } },
  });
  if (existing) {
    await tx.party.update({
      where: { id: existing.role.partyId },
      data: {
        name: record.displayName,
        fullName: record.displayName === record.legalName ? null : record.legalName,
        ...(!existing.role.party.identityNumber.startsWith("TEMP-")
          ? {}
          : { identityNumber: temporaryIdentity }),
      },
    });
    await tx.externalPartyRole.update({
      where: { id: existing.roleId },
      data: roleFields(record),
    });
    await tx.externalPartySourceMapping.update({
      where: uniqueKey,
      data: mappingFields(record, company.id),
    });
    counters.archiveUpdated += 1;
    return existing.roleId;
  }

  const code = archiveRoleCode(record.category, company.code, record.sourceCode);
  const collision = await tx.externalPartyRole.findUnique({
    where: { category_code: { category: record.category, code } },
    select: { id: true },
  });
  if (collision) throw new Error(`${record.category} 全局编码冲突：${code}`);
  const party = await tx.party.create({
    data: {
      subjectType: "organization",
      name: record.displayName,
      fullName: record.displayName === record.legalName ? null : record.legalName,
      identityNumber: temporaryIdentity,
      externalProfile: { create: { relatedPartyType: "unrelated" } },
      externalRoles: {
        create: {
          category: record.category,
          code,
          ...roleFields(record),
          sourceMappings: { create: mappingFields(record, company.id) },
        },
      },
    },
    include: { externalRoles: { select: { id: true } } },
  });
  counters.archiveCreated += 1;
  return party.externalRoles[0].id;
}

async function buildCustomerAliasIndex(tx, companyId) {
  const roles = await tx.externalPartyRole.findMany({
    where: { category: "customer", isActive: true },
    select: {
      id: true,
      party: { select: { name: true, fullName: true } },
      sourceMappings: {
        where: { companyId, sourceSystem: "cost.customer-archive" },
        select: { sourceName: true },
      },
    },
  });
  const index = new Map();
  for (const role of roles) {
    const aliases = new Set([
      role.party.name,
      role.party.fullName,
      ...role.sourceMappings.map((mapping) => mapping.sourceName),
    ].map(normalizeExternalPartyName).filter(Boolean));
    for (const alias of aliases) addCandidate(index, alias, { key: String(role.id), roleId: role.id });
  }
  return index;
}

async function mapShipmentCustomers(tx, company, shipmentGroups, counters) {
  const aliasIndex = await buildCustomerAliasIndex(tx, company.id);
  for (const group of shipmentGroups) {
    const normalized = normalizeExternalPartyName(group.customerName);
    if (!normalized) continue;
    const sourceKey = `name:${normalized}`;
    let mapping = await tx.externalPartySourceMapping.findUnique({
      where: {
        companyId_sourceSystem_sourceKey: {
          companyId: company.id,
          sourceSystem: "finance.shipment",
          sourceKey,
        },
      },
      select: {
        roleId: true,
        role: { select: { code: true, partyId: true, party: { select: { identityNumber: true } } } },
      },
    });
    if (!mapping) {
      const matches = aliasIndex.get(normalized);
      if (matches?.size > 1) {
        counters.ambiguousNames += 1;
        counters.ambiguousRows += group.count;
        continue;
      }
      let roleId = matches?.size === 1 ? [...matches.values()][0].roleId : null;
      if (roleId === null) {
        const code = stableProvisionalCode(company.code, group.customerName);
        const collision = await tx.externalPartyRole.findUnique({
          where: { category_code: { category: "customer", code } },
          select: { id: true },
        });
        if (collision) throw new Error(`发货客户占位编码冲突：${code}`);
        const party = await tx.party.create({
          data: {
            subjectType: "organization",
            name: group.customerName,
            identityNumber: temporaryShipmentIdentity(company.code, group.customerName),
            externalProfile: { create: { relatedPartyType: "unrelated" } },
            externalRoles: { create: { category: "customer", code } },
          },
          include: { externalRoles: { select: { id: true } } },
        });
        roleId = party.externalRoles[0].id;
        addCandidate(aliasIndex, normalized, { key: String(roleId), roleId });
        counters.provisionalCustomers += 1;
      } else {
        counters.archiveMatches += 1;
      }
      mapping = await tx.externalPartySourceMapping.create({
        data: {
          roleId,
          companyId: company.id,
          sourceSystem: "finance.shipment",
          sourceKey,
          sourceName: group.customerName,
          sourceNameNormalized: normalized,
          sourceData: { customerName: group.customerName, rowCount: group.count },
        },
        select: { roleId: true },
      });
    } else {
      if (
        mapping.role.code.startsWith(`CUS-${company.code}-SHP-`)
        && mapping.role.party.identityNumber.startsWith("TEMP-")
      ) {
        await tx.party.update({
          where: { id: mapping.role.partyId },
          data: { identityNumber: temporaryShipmentIdentity(company.code, group.customerName) },
        });
      }
      counters.existingShipmentMappings += 1;
    }
    const updated = await tx.financeShipment.updateMany({
      where: { customerName: group.customerName },
      data: { customerId: mapping.roleId },
    });
    counters.shipmentRowsLinked += updated.count;
  }
}

async function main() {
  const resolvedCompanyCode = requireArgument(companyCode, "company-code");
  const resolvedCustomerFile = requireArgument(customerFile, "customer-file");
  const resolvedSupplierFile = requireArgument(supplierFile, "supplier-file");
  assertReadable(resolvedCustomerFile, "客户档案");
  assertReadable(resolvedSupplierFile, "供应商档案");
  const customerSha256 = sha256(resolvedCustomerFile);
  const supplierSha256 = sha256(resolvedSupplierFile);
  const customers = parseExternalPartyMasterWorkbook(resolvedCustomerFile, "customer");
  const suppliers = parseExternalPartyMasterWorkbook(resolvedSupplierFile, "supplier");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: requireDatabaseUrl(),
      application_name: "workspace-external-party-master-import",
    }),
  });
  try {
    const company = await prisma.company.findUnique({ where: { code: resolvedCompanyCode } });
    if (!company) throw new Error(`公司编码不存在：${resolvedCompanyCode}`);
    const [databaseIdentity, shipmentRows, customerRolesBefore, supplierRolesBefore, sourceMappingsBefore] = await Promise.all([
      prisma.$queryRaw`SELECT current_database() AS "database"`,
      prisma.financeShipment.count(),
      prisma.externalPartyRole.count({ where: { category: "customer" } }),
      prisma.externalPartyRole.count({ where: { category: "supplier" } }),
      prisma.externalPartySourceMapping.count(),
    ]);
    const preflight = {
      database: databaseIdentity[0]?.database,
      customerSha256,
      supplierSha256,
      shipmentRows,
      customerRoles: customerRolesBefore,
      supplierRoles: supplierRolesBefore,
      sourceMappings: sourceMappingsBefore,
    };
    const shipmentGroups = await prisma.financeShipment.groupBy({
      by: ["customerName"],
      where: { customerName: { not: null } },
      _count: { _all: true },
    }).then((groups) => groups
      .filter((group) => normalizeExternalPartyName(group.customerName))
      .map((group) => ({ customerName: group.customerName, count: group._count._all })));
    const existingShipmentSourceKeys = new Set(await prisma.externalPartySourceMapping.findMany({
      where: { companyId: company.id, sourceSystem: "finance.shipment" },
      select: { sourceKey: true },
    }).then((mappings) => mappings.map((mapping) => mapping.sourceKey)));
    const crossRole = dualRolePlan(customers, suppliers);
    console.log(JSON.stringify({
      mode: execute ? "execute" : "dry-run",
      company: company.code,
      preflight,
      ...sourcePlan(customers, suppliers, shipmentGroups, existingShipmentSourceKeys, crossRole),
    }, null, 2));
    if (!execute) return;
    verifyExecutePreflight(preflight);

    const counters = {
      archiveCreated: 0,
      archiveUpdated: 0,
      archiveMatches: 0,
      provisionalCustomers: 0,
      existingShipmentMappings: 0,
      ambiguousNames: 0,
      ambiguousRows: 0,
      shipmentRowsLinked: 0,
      dualRoleMerged: 0,
      existingDualRoleSubjects: 0,
      dualRoleConflicts: 0,
    };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('workspace-external-party-master-import'))`;
      const [shipmentRowsLocked, customerRolesLocked, supplierRolesLocked, sourceMappingsLocked] = await Promise.all([
        tx.financeShipment.count(),
        tx.externalPartyRole.count({ where: { category: "customer" } }),
        tx.externalPartyRole.count({ where: { category: "supplier" } }),
        tx.externalPartySourceMapping.count(),
      ]);
      verifyExecutePreflight({
        ...preflight,
        shipmentRows: shipmentRowsLocked,
        customerRoles: customerRolesLocked,
        supplierRoles: supplierRolesLocked,
        sourceMappings: sourceMappingsLocked,
      });
      for (const record of customers) await upsertArchiveRecord(tx, company, record, counters);
      for (const record of suppliers) await upsertArchiveRecord(tx, company, record, counters);
      await consolidateDualRoles(tx, company, crossRole.exactPairs, counters);
      await mapShipmentCustomers(tx, company, shipmentGroups, counters);
      const unlinkedNamedShipments = await tx.$queryRaw`
        SELECT count(*)::int AS "count"
        FROM "FinanceShipment"
        WHERE "customerId" IS NULL
          AND NULLIF(regexp_replace(trim(COALESCE("customerName", '')), '[[:space:]]+', '', 'g'), '') IS NOT NULL
      `;
      if (counters.dualRoleConflicts > 0 || counters.ambiguousRows > 0 || unlinkedNamedShipments[0].count > 0) {
        throw new Error(
          `导入结果未闭环：双角色冲突 ${counters.dualRoleConflicts}，歧义发货 ${counters.ambiguousRows}，未关联发货 ${unlinkedNamedShipments[0].count}`,
        );
      }
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 120_000 });
    const [parties, customerRoles, supplierRoles, dualRoleSubjects, mappings, linkedShipments, totalShipments] = await Promise.all([
      prisma.party.count(),
      prisma.externalPartyRole.count({ where: { category: "customer" } }),
      prisma.externalPartyRole.count({ where: { category: "supplier" } }),
      prisma.party.count({ where: { externalRoles: { some: { category: "customer" } }, AND: { externalRoles: { some: { category: "supplier" } } } } }),
      prisma.externalPartySourceMapping.count({ where: { companyId: company.id } }),
      prisma.financeShipment.count({ where: { customerId: { not: null } } }),
      prisma.financeShipment.count(),
    ]);
    console.log(JSON.stringify({ result: counters, totals: { parties, customerRoles, supplierRoles, dualRoleSubjects, mappings, linkedShipments, totalShipments } }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
