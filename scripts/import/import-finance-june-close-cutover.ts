import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createExecutionApprovedFinanceAssetErpGlCutoverReconciler,
  getApprovedFinanceAssetLegacySyntheticAssets,
  loadApprovedFinanceAssetCutoverConfig,
} from "@workspace/finance/server/assets/approved-cutover-config";
import { parseAssetWorkbook } from "@workspace/finance/server/assets/current-period-workbook";
import { applyFinanceAssetLegacySyntheticAssets } from "@workspace/finance/server/assets/legacy-synthetic-assets";
import { importAssetWorkbook } from "@workspace/finance/server/assets/workbook-import";
import {
  bindExecuteRefreshFinanceCloseRouteCommand,
  buildCompleteFinanceCloseRouteCommand,
  buildOpenFinanceCloseRouteCommand,
  buildRefreshFinanceCloseRouteCommand,
  executeCompleteFinanceCloseRouteCommand,
  executeOpenFinanceCloseRouteCommand,
} from "@workspace/finance/server/close/route-commands";
import { buildTreasuryCreateRouteCommand, executeTreasuryCreateRouteCommand } from "@workspace/finance/server/treasury/route-commands";
import { listTreasuryWorkspace } from "@workspace/finance/server/treasury/service";
import { inventoryClosingAdapter } from "@workspace/inventory/server/closing-adapter";
import { importInventoryPhysicalCount } from "@workspace/inventory/server/physical-count-import";
import { importInventoryWorkbook, parseInventoryWorkbook } from "@workspace/inventory/server/workbook-import";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  parseFinanceJuneCloseCutoverPayload,
  type FinanceJuneCloseCutoverPayload,
  type FinanceJuneCloseSourceTrace,
  type FinanceJuneCloseVoucherReference,
} from "./finance-june-close-cutover-input";

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? "";
}

function resolvePrivatePath(payloadFile: string, relative: string) {
  const root = path.dirname(payloadFile);
  const resolved = path.resolve(root, relative);
  const withinRoot = resolved === root || resolved.startsWith(`${root}${path.sep}`);
  if (!withinRoot) throw new Error(`私有来源路径越界：${relative}`);
  return resolved;
}

async function fileSha256(file: string) {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function validateFrozenSources(payloadFile: string, payload: FinanceJuneCloseCutoverPayload) {
  const unique = new Set<string>();
  for (const source of payload.sourceFiles) {
    if (unique.has(source.path)) throw new Error(`来源文件重复：${source.path}`);
    unique.add(source.path);
    const resolved = resolvePrivatePath(payloadFile, source.path);
    const actual = await fileSha256(resolved);
    if (actual !== source.sha256) throw new Error(`来源摘要不一致：${source.path}`);
  }
  const referenced = [
    ...payload.assetImports.flatMap((item) => [item.workbookFile, item.approvalConfigFile]),
    ...payload.inventoryWorkbookImports.map((item) => item.workbookFile),
    ...payload.physicalCountImports.map((item) => item.sourceFile),
    payload.treasury.sourceFile,
  ];
  for (const value of referenced) if (!unique.has(value)) throw new Error(`payload 引用了未冻结来源：${value}`);
}

async function dryRun(payloadFile: string, payload: FinanceJuneCloseCutoverPayload) {
  const assets = [];
  for (const item of payload.assetImports) {
    const workbookFile = resolvePrivatePath(payloadFile, item.workbookFile);
    const config = await loadApprovedFinanceAssetCutoverConfig(resolvePrivatePath(payloadFile, item.approvalConfigFile), item);
    const parsed = applyFinanceAssetLegacySyntheticAssets(
      parseAssetWorkbook(await fs.readFile(workbookFile), { sourceFile: path.basename(workbookFile), companyCode: item.companyCode, year: item.year, month: item.month }),
      [...getApprovedFinanceAssetLegacySyntheticAssets(config)],
    );
    assets.push({ companyCode: item.companyCode, cards: parsed.assets.length, costEvidence: parsed.renovationCostEvidence.length, blockers: parsed.blockers.length });
  }
  const inventory = payload.inventoryWorkbookImports.map((item) => {
    const source = payload.sourceFiles.find((row) => row.path === item.workbookFile)!;
    return fs.readFile(resolvePrivatePath(payloadFile, item.workbookFile)).then((buffer) => {
      const parsed = parseInventoryWorkbook(buffer);
      return { companyCode: item.companyCode, sourceSha256: source.sha256, receiptRows: parsed.checks.receiptRows, issueRows: parsed.checks.issueRows, maskVariance: parsed.checks.maskVariance };
    });
  });
  return {
    mode: "dry-run",
    assets,
    inventory: await Promise.all(inventory),
    physicalCounts: payload.physicalCountImports.map((item) => ({ companyCode: item.companyCode, rows: item.lines.length, quantity: item.lines.reduce((sum, line) => sum + line.quantity, 0) })),
    treasury: { loans: payload.treasury.loans.length, principalEvents: payload.treasury.loans.reduce((sum, item) => sum + item.principalEvents.length, 0), interestLines: payload.treasury.loans.reduce((sum, item) => sum + item.workpaper.lines.length, 0) },
    closeScopes: payload.closeScopes,
  };
}

async function executeAssetImports(payloadFile: string, payload: FinanceJuneCloseCutoverPayload, userId: number) {
  const results = [];
  for (const item of payload.assetImports) {
    const workbookFile = resolvePrivatePath(payloadFile, item.workbookFile);
    const buffer = await fs.readFile(workbookFile);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const scope = { sourceFile: path.basename(workbookFile), companyCode: item.companyCode, year: item.year, month: item.month };
    const config = await loadApprovedFinanceAssetCutoverConfig(resolvePrivatePath(payloadFile, item.approvalConfigFile), item);
    const parseWorkbookForCutover = (workbookBuffer: Buffer, workbookScope: typeof scope) => applyFinanceAssetLegacySyntheticAssets(
      parseAssetWorkbook(workbookBuffer, workbookScope),
      [...getApprovedFinanceAssetLegacySyntheticAssets(config)],
    );
    const parsed = parseWorkbookForCutover(buffer, scope);
    const existing = await prisma.financeAssetImportBatch.findUnique({
      where: { companyCode_checksum: { companyCode: item.companyCode, checksum } },
      include: {
        company: { select: { code: true } },
        cutoverPeriod: { select: { companyCode: true, year: true, month: true, isClosed: true } },
        acquisitionEvidence: { select: { sourceChecksum: true, asset: { select: { companyCode: true, sourceKey: true } } } },
      },
    });
    if (existing) {
      const expectedSourceKeys = new Set(parsed.assets.map((asset) => asset.sourceKey));
      const storedSourceKeys = new Set(existing.acquisitionEvidence.map((row) => row.asset.sourceKey));
      const invalid = existing.company?.code !== item.companyCode || existing.sourceFile !== scope.sourceFile
        || existing.status !== "confirmed" || existing.cardCount !== parsed.assets.length
        || existing.costLineCount !== parsed.renovationCostEvidence.length || existing.cutoverDate !== "2026-06-30"
        || !existing.cutoverPeriod?.isClosed || existing.cutoverPeriod.companyCode !== item.companyCode
        || existing.cutoverPeriod.year !== item.year || existing.cutoverPeriod.month !== item.month
        || existing.acquisitionEvidence.length !== parsed.assets.length || storedSourceKeys.size !== expectedSourceKeys.size
        || [...expectedSourceKeys].some((sourceKey) => !storedSourceKeys.has(sourceKey))
        || existing.acquisitionEvidence.some((row) => row.sourceChecksum !== checksum || row.asset.companyCode !== item.companyCode);
      if (invalid) throw new Error(`既有资产导入批次与冻结来源不一致：${item.companyCode}`);
      results.push({ companyCode: item.companyCode, result: { replayed: true, batchId: existing.id, cardCount: existing.cardCount, costEvidenceCount: existing.costLineCount } });
      continue;
    }
    results.push({
      companyCode: item.companyCode,
      result: await importAssetWorkbook(
        { buffer, ...scope, userId },
        {
          parseWorkbook: parseWorkbookForCutover,
          reconcileCutover: createExecutionApprovedFinanceAssetErpGlCutoverReconciler(config, payload.actorUsername),
        },
      ),
    });
  }
  return results;
}

async function repairRequiredFinanceCompanyReferences(payload: FinanceJuneCloseCutoverPayload) {
  const scopes = [...new Map(payload.closeScopes.map((scope) => [`${scope.companyCode}:${scope.year}:${scope.month}`, scope])).values()];
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const scope of scopes) {
      const company = await tx.company.findUnique({ where: { code: scope.companyCode }, select: { id: true } });
      if (!company) throw new Error(`目标公司不存在：${scope.companyCode}`);
      const period = await tx.financePeriod.findUnique({
        where: { companyCode_year_month: scope },
        select: { id: true, companyId: true },
      });
      if (!period) throw new Error(`目标会计期间不存在：${scope.companyCode}/${scope.year}-${scope.month}`);
      if (period.companyId != null && period.companyId !== company.id) throw new Error(`会计期间 companyId 冲突：${scope.companyCode}`);
      const conflictingAccounts = await tx.financeAccount.count({
        where: { companyCode: scope.companyCode, year: scope.year, companyId: { not: null, notIn: [company.id] } },
      });
      const conflictingBalances = await tx.financeAccountBalance.count({
        where: { companyCode: scope.companyCode, periodId: period.id, companyId: { not: null, notIn: [company.id] } },
      });
      if (conflictingAccounts || conflictingBalances) {
        throw new Error(`公司 FK 存在冲突：${scope.companyCode} accounts=${conflictingAccounts} balances=${conflictingBalances}`);
      }
      const periodUpdated = period.companyId == null
        ? await tx.financePeriod.update({ where: { id: period.id }, data: { companyId: company.id }, select: { id: true } }).then(() => 1)
        : 0;
      const accountsUpdated = (await tx.financeAccount.updateMany({
        where: { companyCode: scope.companyCode, year: scope.year, companyId: null },
        data: { companyId: company.id },
      })).count;
      const balancesUpdated = (await tx.financeAccountBalance.updateMany({
        where: { companyCode: scope.companyCode, periodId: period.id, companyId: null },
        data: { companyId: company.id },
      })).count;
      const missingAccounts = await tx.financeAccount.count({ where: { companyCode: scope.companyCode, year: scope.year, companyId: null } });
      const missingBalances = await tx.financeAccountBalance.count({ where: { companyCode: scope.companyCode, periodId: period.id, companyId: null } });
      if (missingAccounts || missingBalances) throw new Error(`公司 FK 最小回填未完成：${scope.companyCode}`);
      results.push({ companyCode: scope.companyCode, periodUpdated, accountsUpdated, balancesUpdated });
    }
    return results;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function executeInventoryImports(payloadFile: string, payload: FinanceJuneCloseCutoverPayload, userId: number) {
  const workbooks = [];
  for (const item of payload.inventoryWorkbookImports) {
    const workbookFile = resolvePrivatePath(payloadFile, item.workbookFile);
    workbooks.push({ companyCode: item.companyCode, result: await importInventoryWorkbook({
      buffer: await fs.readFile(workbookFile),
      sourceFile: path.basename(workbookFile),
      companyCode: item.companyCode,
      userId,
    }) });
  }
  const physicalCounts = [];
  for (const item of payload.physicalCountImports) {
    physicalCounts.push(await importInventoryPhysicalCount({ ...item, userId }));
  }
  return { workbooks, physicalCounts };
}

function trace(payload: FinanceJuneCloseCutoverPayload, value: FinanceJuneCloseSourceTrace) {
  return {
    sourceKind: "historical-cutover-input",
    sourceReleaseId: option("release-id"),
    sourceSha256: payload.treasury.sourceSha256,
    sourceFile: payload.treasury.sourceFile,
    sourceSheet: value.sourceSheet,
    sourceRow: value.sourceRow ?? null,
    sourceRange: value.sourceRange ?? null,
    sourceKey: value.sourceKey,
  };
}

async function resolvePartyId(fullName: string) {
  const rows = await prisma.party.findMany({ where: { fullName }, select: { id: true }, take: 2 });
  if (rows.length !== 1) throw new Error(`借款方必须唯一命中 Party.fullName：${fullName}`);
  return rows[0]!.id;
}

async function resolveVoucherItem(input: FinanceJuneCloseVoucherReference, companyCode: string, year: number, month: number) {
  const rows = await prisma.financeVoucherItem.findMany({
    where: {
      sortOrder: input.sortOrder,
      debit: input.debit,
      account: { code: input.accountCode, companyCode, year },
      voucher: { companyCode, voucherNo: input.voucherNo, status: "posted", period: { year, month } },
    },
    select: { id: true },
    take: 2,
  });
  if (rows.length !== 1) throw new Error(`利息凭证分录无法唯一解析：${input.voucherNo}/${input.sortOrder}`);
  return rows[0]!.id;
}

function assertLoanMatches(existing: Awaited<ReturnType<typeof loadLoanBySource>>, input: FinanceJuneCloseCutoverPayload["treasury"]["loans"][number], lenderPartyId: number) {
  if (!existing || existing.lenderPartyId !== lenderPartyId || existing.identityKey !== input.identityKey
    || existing.loanNo !== input.loanNo || existing.name !== input.name
    || Number(existing.contractPrincipalAmount) !== input.contractPrincipalAmount || existing.startOn.toISOString().slice(0, 10) !== input.startOn
    || existing.rateTerms.length !== input.rateTerms.length) throw new Error(`既有借款与冻结 payload 不一致：${input.identityKey}`);
  for (let index = 0; index < input.rateTerms.length; index += 1) {
    const actual = existing.rateTerms[index]!;
    const expected = input.rateTerms[index]!;
    if (actual.effectiveFrom.toISOString().slice(0, 10) !== expected.effectiveFrom
      || (actual.effectiveThrough?.toISOString().slice(0, 10) ?? null) !== (expected.effectiveThrough ?? null)
      || Number(actual.annualRate) !== expected.annualRate || actual.dayCountConvention !== expected.dayCountConvention
      || actual.sourceKey !== expected.sourceKey) throw new Error(`既有利率条款与冻结 payload 不一致：${expected.sourceKey}`);
  }
}

function loadLoanBySource(releaseId: string, sourceKey: string) {
  return prisma.financeLoan.findFirst({
    where: { sourceReleaseId: releaseId, sourceKey },
    include: { rateTerms: { orderBy: { effectiveFrom: "asc" } } },
  });
}

async function executeTreasury(payload: FinanceJuneCloseCutoverPayload, userId: number, releaseId: string) {
  const results = [];
  for (const input of payload.treasury.loans) {
    const lenderPartyId = await resolvePartyId(input.lenderFullName);
    let stored = await loadLoanBySource(releaseId, input.sourceKey);
    if (stored) assertLoanMatches(stored, input, lenderPartyId);
    else {
      const command = await buildTreasuryCreateRouteCommand({
        kind: "loan_create",
        companyCode: payload.treasury.companyCode,
        lenderPartyId,
        identityKey: input.identityKey,
        loanNo: input.loanNo,
        name: input.name,
        currencyCode: "CNY",
        contractPrincipalAmount: input.contractPrincipalAmount,
        startOn: input.startOn,
        endOn: null,
        status: "active",
        note: "2026-06-30历史切换借款主档；本金、利率和日期为输入，利息由系统计算",
        ...trace(payload, input),
        rateTerms: input.rateTerms.map((term) => ({
          effectiveFrom: term.effectiveFrom,
          effectiveThrough: term.effectiveThrough ?? null,
          annualRate: term.annualRate,
          spreadRate: null,
          rateKind: "fixed" as const,
          benchmark: null,
          dayCountConvention: term.dayCountConvention,
          ...trace(payload, term),
        })),
      }, userId);
      if (!command.ok) throw new Error(command.issue.message);
      await executeTreasuryCreateRouteCommand(command.data);
      stored = await loadLoanBySource(releaseId, input.sourceKey);
      if (!stored) throw new Error(`借款创建后无法读取：${input.identityKey}`);
      assertLoanMatches(stored, input, lenderPartyId);
    }
    for (const event of input.principalEvents) {
      const eventCommand = await buildTreasuryCreateRouteCommand({
        kind: "principal_event_append",
        companyCode: payload.treasury.companyCode,
        year: input.workpaper.year,
        month: input.workpaper.month,
        periodId: (await prisma.financePeriod.findUniqueOrThrow({ where: { companyCode_year_month: { companyCode: payload.treasury.companyCode, year: input.workpaper.year, month: input.workpaper.month } }, select: { id: true } })).id,
        loanId: stored.id,
        voucherItemId: null,
        eventKind: "drawdown",
        occurredOn: event.occurredOn,
        amount: event.amount,
        referenceNo: input.loanNo,
        note: "历史切换本金输入；计息分段保留在利息底稿逐行计算",
        reversesEventId: null,
        idempotencyKey: `${releaseId}:${event.sourceKey}`.slice(0, 200),
        ...trace(payload, event),
      }, userId);
      if (!eventCommand.ok) throw new Error(eventCommand.issue.message);
      await executeTreasuryCreateRouteCommand(eventCommand.data);
    }
    const period = await prisma.financePeriod.findUniqueOrThrow({
      where: { companyCode_year_month: { companyCode: payload.treasury.companyCode, year: input.workpaper.year, month: input.workpaper.month } },
      select: { id: true },
    });
    const voucherItemId = await resolveVoucherItem(input.workpaper.voucherReference, payload.treasury.companyCode, input.workpaper.year, input.workpaper.month);
    const existingWorkpaper = await prisma.financeInterestWorkpaper.findUnique({
      where: { loanId_periodId: { loanId: stored.id, periodId: period.id } },
      include: { lines: { orderBy: { lineNo: "asc" } }, voucherLinks: true },
    });
    if (existingWorkpaper) {
      if (existingWorkpaper.sourceReleaseId !== releaseId || existingWorkpaper.sourceKey !== input.workpaper.sourceKey
        || existingWorkpaper.lines.length !== input.workpaper.lines.length || existingWorkpaper.voucherLinks.length !== 1
        || existingWorkpaper.voucherLinks[0]!.voucherItemId !== voucherItemId
        || Number(existingWorkpaper.voucherLinks[0]!.amount) !== input.workpaper.expectedCalculatedAmount
        || existingWorkpaper.voucherLinks[0]!.sourceReleaseId !== releaseId
        || existingWorkpaper.voucherLinks[0]!.sourceKey !== `finance-voucher:${input.workpaper.voucherReference.voucherNo}:item:${input.workpaper.voucherReference.sortOrder}`) {
        throw new Error(`既有利息底稿与冻结 payload 不一致：${input.workpaper.sourceKey}`);
      }
      for (let index = 0; index < input.workpaper.lines.length; index += 1) {
        const actual = existingWorkpaper.lines[index]!;
        const expected = input.workpaper.lines[index]!;
        if (actual.lineNo !== expected.lineNo || actual.accrualFrom.toISOString().slice(0, 10) !== expected.accrualFrom
          || actual.accrualThrough.toISOString().slice(0, 10) !== expected.accrualThrough
          || Number(actual.principalBasis) !== expected.principalBasis || Number(actual.annualRate) !== expected.annualRate
          || actual.sourceReportedInterestAmount !== null || actual.sourceKey !== expected.sourceKey) {
          throw new Error(`既有利息行与冻结 payload 不一致：${expected.sourceKey}`);
        }
      }
    } else {
      const workpaperCommand = await buildTreasuryCreateRouteCommand({
        kind: "interest_workpaper_create",
        companyCode: payload.treasury.companyCode,
        year: input.workpaper.year,
        month: input.workpaper.month,
        periodId: period.id,
        loanId: stored.id,
        status: "reconciled",
        dayCountConvention: input.workpaper.dayCountConvention,
        note: "本金、利率和计息日期为输入；天数与利息金额由 Finance server 计算",
        ...trace(payload, input.workpaper),
        lines: input.workpaper.lines.map((line) => ({
          lineNo: line.lineNo,
          accrualFrom: line.accrualFrom,
          accrualThrough: line.accrualThrough,
          principalBasis: line.principalBasis,
          annualRate: line.annualRate,
          sourceReportedInterestAmount: null,
          note: "本金、利率、计息起止日为切换输入；天数和利息由系统派生",
          ...trace(payload, line),
        })),
        voucherLinks: [{
          voucherItemId,
          linkKind: "accrual",
          amount: input.workpaper.expectedCalculatedAmount,
          note: "勾稽既有已过账利息费用分录，不创建新凭证",
          sourceKind: "posted-voucher",
          sourceReleaseId: releaseId,
          sourceSha256: null,
          sourceFile: null,
          sourceSheet: null,
          sourceRow: null,
          sourceRange: null,
          sourceKey: `finance-voucher:${input.workpaper.voucherReference.voucherNo}:item:${input.workpaper.voucherReference.sortOrder}`,
        }],
      }, userId);
      if (!workpaperCommand.ok) throw new Error(workpaperCommand.issue.message);
      await executeTreasuryCreateRouteCommand(workpaperCommand.data);
    }
    results.push({ identityKey: input.identityKey, loanId: stored.id });
  }
  const workspace = await listTreasuryWorkspace({ companyCode: payload.treasury.companyCode, year: 2026, month: 6 });
  for (const input of payload.treasury.loans) {
    const row = workspace.interestWorkpapers.find((item) => item.sourceReleaseId === releaseId && item.sourceKey === input.workpaper.sourceKey);
    if (!row || row.calculation.calculatedAmount !== input.workpaper.expectedCalculatedAmount || row.calculation.voucherDifference !== 0
      || row.lines.some((line) => line.sourceReportedInterestAmount !== null)) {
      throw new Error(`利息系统计算或凭证勾稽失败：${input.workpaper.sourceKey}`);
    }
  }
  return { loans: results, calculatedInterest: workspace.interestWorkpapers.filter((item) => item.sourceReleaseId === releaseId).reduce((sum, item) => sum + item.calculation.calculatedAmount, 0) };
}

async function executeTreasuryWithTemporaryOpenPeriod(payload: FinanceJuneCloseCutoverPayload, userId: number, releaseId: string) {
  const year = payload.treasury.loans[0]!.workpaper.year;
  const month = payload.treasury.loans[0]!.workpaper.month;
  if (payload.treasury.loans.some((loan) => loan.workpaper.year !== year || loan.workpaper.month !== month)) {
    throw new Error("本次资金切换只允许单一会计期间");
  }
  const period = await prisma.financePeriod.findUniqueOrThrow({
    where: { companyCode_year_month: { companyCode: payload.treasury.companyCode, year, month } },
    select: { id: true, isClosed: true, sourceClosed: true },
  });
  if (!period.sourceClosed) throw new Error("资金历史切换必须引用来源已关账期间");
  if (period.isClosed) await prisma.financePeriod.update({ where: { id: period.id }, data: { isClosed: false } });
  try {
    return await executeTreasury(payload, userId, releaseId);
  } finally {
    if (period.isClosed) await prisma.financePeriod.update({ where: { id: period.id }, data: { isClosed: true } });
  }
}

function unwrapCommand<T>(result: { ok: true; data: T } | { ok: false; issue: { message: string } }) {
  if (!result.ok) throw new Error(result.issue.message);
  return result.data;
}

function unwrapService<T>(result: { ok: true; data: T } | { ok: false; error: string }) {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function executeCloseScopes(payload: FinanceJuneCloseCutoverPayload, userId: number, releaseId: string) {
  const results = [];
  for (const scope of payload.closeScopes) {
    const period = await prisma.financePeriod.findUniqueOrThrow({ where: { companyCode_year_month: scope }, select: { id: true, isClosed: true, sourceClosed: true } });
    if (period.sourceClosed !== true) throw new Error(`历史关账期间未标记来源已关账：${scope.companyCode}`);
    let run: { id: number; status: string; version: number } | null = await prisma.financeCloseRun.findUnique({
      where: { companyId_periodId: { companyId: (await prisma.company.findUniqueOrThrow({ where: { code: scope.companyCode }, select: { id: true } })).id, periodId: period.id } },
      select: { id: true, status: true, version: true },
    });
    if (run?.status === "completed") {
      const ready = await prisma.financeCloseTask.count({ where: { runId: run.id, status: "ready" } });
      if (ready !== 27) throw new Error(`既有关账运行不是 27/27：${scope.companyCode}`);
      results.push({ companyCode: scope.companyCode, runId: run.id, status: run.status, ready, replayed: true });
      continue;
    }
    const initiallyClosed = period.isClosed;
    if (initiallyClosed) await prisma.financePeriod.update({ where: { id: period.id }, data: { isClosed: false } });
    let completed = false;
    try {
      if (!run) {
        const opened = unwrapService(await executeOpenFinanceCloseRouteCommand(unwrapCommand(await buildOpenFinanceCloseRouteCommand({
          ...scope,
          idempotencyKey: `${releaseId}:close:${scope.companyCode}:open`.slice(0, 128),
        }, userId))));
        run = opened.run ? { id: opened.run.id, status: opened.run.status, version: opened.run.version } : null;
      }
      if (!run || run.status !== "open") throw new Error(`关账运行未开放：${scope.companyCode}`);
      const refreshed = unwrapService(await bindExecuteRefreshFinanceCloseRouteCommand(inventoryClosingAdapter)(unwrapCommand(await buildRefreshFinanceCloseRouteCommand({
        runId: run.id,
        expectedVersion: run.version,
        idempotencyKey: `${releaseId}:close:${scope.companyCode}:refresh:${run.version}`.slice(0, 128),
      }, userId))));
      const nonReady = refreshed.tasks.filter((task) => task.status !== "ready");
      if (refreshed.statusCounts.ready !== 27 || nonReady.length > 0) {
        throw new Error(`关账未达到 27/27：${scope.companyCode} ${nonReady.map((task) => `${task.sequence}:${task.status}`).join(",")}`);
      }
      const completedWorkspace = unwrapService(await executeCompleteFinanceCloseRouteCommand(unwrapCommand(await buildCompleteFinanceCloseRouteCommand({
        runId: refreshed.run!.id,
        expectedVersion: refreshed.run!.version,
        idempotencyKey: `${releaseId}:close:${scope.companyCode}:complete:${refreshed.run!.version}`.slice(0, 128),
      }, userId))));
      completed = completedWorkspace.run?.status === "completed" && completedWorkspace.statusCounts.ready === 27;
      if (!completed) throw new Error(`关账完成状态异常：${scope.companyCode}`);
      results.push({ companyCode: scope.companyCode, runId: completedWorkspace.run!.id, status: completedWorkspace.run!.status, ready: completedWorkspace.statusCounts.ready, replayed: false });
    } finally {
      if (initiallyClosed && !completed) await prisma.financePeriod.update({ where: { id: period.id }, data: { isClosed: true } });
    }
  }
  return results;
}

export async function main() {
  const payloadValue = option("input-file");
  const releaseId = option("release-id");
  const execute = process.argv.includes("--execute");
  if (!payloadValue || !path.isAbsolute(payloadValue) || !releaseId) throw new Error("用法: --input-file=<absolute.json> --release-id=<id> [--execute]");
  const payloadFile = path.resolve(payloadValue);
  const payload = parseFinanceJuneCloseCutoverPayload(JSON.parse(await fs.readFile(payloadFile, "utf8")));
  await validateFrozenSources(payloadFile, payload);
  const preview = await dryRun(payloadFile, payload);
  if (!execute) {
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }
  const actor = await prisma.user.findUnique({ where: { username: payload.actorUsername }, select: { id: true, canLogin: true } });
  if (!actor?.canLogin) throw new Error("数据发布操作者不存在或不可登录");
  try {
    const companyReferences = await repairRequiredFinanceCompanyReferences(payload);
    const assets = await executeAssetImports(payloadFile, payload, actor.id);
    const inventory = await executeInventoryImports(payloadFile, payload, actor.id);
    const treasury = await executeTreasuryWithTemporaryOpenPeriod(payload, actor.id, releaseId);
    const close = await executeCloseScopes(payload, actor.id, releaseId);
    process.stdout.write(`${JSON.stringify({ mode: "execute", releaseId, preview, companyReferences, assets, inventory, treasury, close }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
