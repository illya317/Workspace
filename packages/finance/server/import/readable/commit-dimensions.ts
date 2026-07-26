import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import type { CoreCommitContext } from "./commit-core";
import type { NormalizedAuxiliaryRef, NormalizedReadableBatch } from "./types";

function memberKey(dimensionType: string, sourceCode: string) {
  return `${dimensionType}:${sourceCode}`;
}

type CompanyLink = {
  linkedCompanyId: number;
  companyLinkMethod: string | null;
  companyLinkEvidence: string | null;
};

function uniqueCompanyLinks(rows: Array<{
  sourceName: string;
  linkedCompanyId: number | null;
  companyLinkMethod: string | null;
  companyLinkEvidence: string | null;
}>) {
  const candidates = new Map<string, CompanyLink | null>();
  for (const row of rows) {
    if (!row.linkedCompanyId) continue;
    const name = row.sourceName.trim();
    const current = candidates.get(name);
    if (current && current.linkedCompanyId !== row.linkedCompanyId) {
      candidates.set(name, null);
    } else if (current === undefined) {
      candidates.set(name, {
        linkedCompanyId: row.linkedCompanyId,
        companyLinkMethod: row.companyLinkMethod,
        companyLinkEvidence: row.companyLinkEvidence,
      });
    }
  }
  return new Map([...candidates.entries()].filter((row): row is [string, CompanyLink] => row[1] !== null));
}

export async function upsertAuxiliaryMembers(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
): Promise<Map<string, number>> {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const existing = await tx.financeAuxiliaryMember.findMany({
    where: {
      companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
      sourceLedger: batch.spec.sourceLedger,
    },
  });
  const byKey = new Map(existing.map((item) => [memberKey(item.dimensionType, item.sourceCode), item]));
  const verifiedMemberLinks = await tx.financeAuxiliaryMember.findMany({
    where: { linkedCompanyId: { not: null } },
    select: {
      sourceName: true, linkedCompanyId: true,
      companyLinkMethod: true, companyLinkEvidence: true,
    },
  });
  const legalCompanies = await tx.company.findMany({
    where: { isActive: true, party: { fullName: { not: null } } },
    select: { id: true, party: { select: { fullName: true } } },
  });
  const verifiedLinks = uniqueCompanyLinks([
    ...verifiedMemberLinks,
    ...legalCompanies.flatMap((company) => company.party.fullName ? [{
      sourceName: company.party.fullName,
      linkedCompanyId: company.id,
      companyLinkMethod: "exact_legal_name",
      companyLinkEvidence: "ERP auxiliary name exactly matches active Company Party.fullName",
    }] : []),
  ]);
  const result = new Map<string, number>();
  for (const item of batch.auxiliaryMembers) {
    const key = memberKey(item.dimensionType, item.sourceCode);
    const found = byKey.get(key);
    const inheritedLink = found?.linkedCompanyId ? null : verifiedLinks.get(item.sourceName.trim());
    const data = {
      sourceName: item.sourceName, shortName: item.shortName ?? null,
      identityNumber: item.identityNumber ?? null, contactPerson: item.contactPerson ?? null,
      phone: item.phone ?? null, address: item.address ?? null, bankName: item.bankName ?? null,
      bankAccount: item.bankAccount ?? null, latestImportId: importId,
      firstYear: Math.min(found?.firstYear ?? batch.spec.year, batch.spec.year),
      lastYear: Math.max(found?.lastYear ?? batch.spec.year, batch.spec.year),
      ...(inheritedLink ? inheritedLink : {}),
    };
    const record = found
      ? await tx.financeAuxiliaryMember.update({ where: { id: found.id }, data })
      : await tx.financeAuxiliaryMember.create({
        data: {
          companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
          sourceLedger: batch.spec.sourceLedger, dimensionType: item.dimensionType,
          sourceCode: item.sourceCode, ...data,
        },
      });
    result.set(key, record.id);
  }
  return result;
}

function resolveMember(
  ref: NormalizedAuxiliaryRef,
  members: Map<string, number>,
  warnings: string[],
): number | undefined {
  const id = members.get(memberKey(ref.dimensionType, ref.sourceCode));
  if (!id) warnings.push(`辅助成员未映射：${ref.dimensionType}/${ref.sourceCode}`);
  return id;
}

export async function replaceVoucherAuxiliaryLinks(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  core: CoreCommitContext,
  members: Map<string, number>,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  if (core.itemIds.length) {
    await tx.financeVoucherItemAuxiliary.deleteMany({ where: { itemId: { in: core.itemIds } } });
  }
  const rows = batch.vouchers.flatMap((voucher) => voucher.items.flatMap((item) => {
    const itemId = core.items.get(item.sourceKey);
    if (!itemId) return [];
    return item.auxiliaryRefs.flatMap((ref) => {
      const memberId = resolveMember(ref, members, batch.warnings);
      return memberId ? [{ itemId, memberId, sourceRole: ref.sourceRole }] : [];
    });
  }));
  if (rows.length) await tx.financeVoucherItemAuxiliary.createMany({ data: rows, skipDuplicates: true });
}

export async function replaceAuxiliaryBalances(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  core: CoreCommitContext,
  members: Map<string, number>,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const existing = await tx.financeAuxiliaryBalance.findMany({
    where: { importId },
    select: { id: true, sourceKey: true },
  });
  const sourceKeys = new Set(batch.auxiliaryBalances.map((item) => item.sourceKey));
  for (const item of batch.auxiliaryBalances) {
    const periodId = core.periods.get(item.month);
    const accountId = core.accounts.get(item.accountSourceKey);
    if (!periodId || !accountId) {
      batch.warnings.push(`辅助余额未映射科目/期间：${item.accountCode}/${item.month}`);
      continue;
    }
    const data = {
        importId, periodId, accountId, companyCode: batch.spec.companyCode,
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: item.sourceKey, openingDebit: item.openingDebit, openingCredit: item.openingCredit,
        currentDebit: item.currentDebit, currentCredit: item.currentCredit,
        closingDebit: item.closingDebit, closingCredit: item.closingCredit,
    };
    const record = await tx.financeAuxiliaryBalance.upsert({
      where: {
        sourceSystem_sourceDatabase_sourceKey: {
          sourceSystem: batch.spec.sourceSystem,
          sourceDatabase: batch.spec.sourceDatabase,
          sourceKey: item.sourceKey,
        },
      },
      create: data,
      update: data,
    });
    await tx.financeAuxiliaryBalanceMember.deleteMany({ where: { balanceId: record.id } });
    const links = (item.auxiliaryRefs ?? []).flatMap((ref) => {
      const memberId = resolveMember(ref, members, batch.warnings);
      return memberId ? [{ balanceId: record.id, memberId, sourceRole: ref.sourceRole }] : [];
    });
    if (links.length) await tx.financeAuxiliaryBalanceMember.createMany({ data: links, skipDuplicates: true });
  }
  const staleIds = existing.filter((item) => !sourceKeys.has(item.sourceKey)).map((item) => item.id);
  if (staleIds.length) await tx.financeAuxiliaryBalance.deleteMany({ where: { id: { in: staleIds } } });
}
