import type { FinanceCloseBlockerDto, FinanceCloseProviderInspection, FinanceCloseScope } from "../../types/close";
import { financeCloseInspectionFingerprint } from "../close/inspection-identity";
import { calculateFinanceAssetPeriod } from "./calculator";
import { assetReplayVoucherIsControlled, replayAssetAccumulatedAmounts } from "./accumulated-replay";
import { assetScopeFingerprint, assetImpairmentCalculationBasisFingerprint, dateInFinanceClosePeriod, financeClosePeriodBounds } from "./period-scope";
import { buildFinanceAssetCloseProviders } from "./close-provider-data";
import {
  accumulateAmount, acquisitionEvidenceSummary, resolveConfirmedDisposalDate, disposalVoucherMatches,
  fullVoucherSummary, impairmentVoucherMatches, impairmentVoucherSummary, policySnapshotMatches,
  postedVoucherInScope, relevantPolicies, scopedVoucherSummary, uniqueDepreciationVouchers,
  voucherItemsMatchTotals, type AssetCloseCard, type AssetDepreciationCloseFacts, type AssetDepreciationVoucherFact,
  type AssetImpairmentCloseFacts, type AssetMovementCloseFacts,
} from "./close-provider-evidence";
import { moneyEquals, moneyIsNonZero, moneyIsZero, moneyToCents, voucherItemsAreFullyConsumed } from "./money-cents";
import { buildSourceClosedCutoverOutcome, isControlledCutoverOpening } from "./close-cutover-policy";
import { FINANCE_ASSET_LEGACY_CUTOVER_MODE } from "./legacy-cutover";

export type { AssetCloseCard, AssetDepreciationCloseFacts, AssetImpairmentCloseFacts, AssetMovementCloseFacts, AssetPolicyFact } from "./close-provider-evidence";
const unique = (values: string[]) => [...new Set(values)].sort();
type AssetCloseDeepLinkView = "cards" | "period" | "adjustments";
const scopedLink = (view: AssetCloseDeepLinkView, scope: FinanceCloseScope) => `/finance/assets?view=${view}&companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;
const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
function result(
  status: FinanceCloseProviderInspection["status"],
  contributorVersion: string,
  deepLink: string,
  payload: unknown,
  blockers: FinanceCloseBlockerDto[] = [], evidenceRefs: string[] = [], voucherRefs: string[] = [],
): FinanceCloseProviderInspection {
  const normalizedEvidenceRefs = unique(evidenceRefs);
  const normalizedVoucherRefs = unique(voucherRefs);
  return {
    status,
    contributorVersion,
    inputFingerprint: financeCloseInspectionFingerprint({ status, blockers, evidenceRefs: normalizedEvidenceRefs, voucherRefs: normalizedVoucherRefs, deepLink, payload }),
    blockers,
    evidenceRefs: normalizedEvidenceRefs,
    voucherRefs: normalizedVoucherRefs,
    deepLink,
    payload,
  };
}

function issue(code: string, message: string, deepLink: string): FinanceCloseBlockerDto {
  return { code, message, deepLink };
}

export function inspectAssetMovementCloseFacts(
  scope: FinanceCloseScope,
  facts: AssetMovementCloseFacts,
): FinanceCloseProviderInspection {
  const deepLink = scopedLink("cards", scope);
  if (!facts.period) {
    const payload = { scope, periodId: null };
    return result("blocked", "asset-movements-close-v2", deepLink, payload, [issue("asset_period_missing", "资产关账期间不存在", deepLink)]);
  }
  const periodId = facts.period.id;
  const policyByCategory = new Map(facts.policies.map((policy) => [policy.categoryId, policy]));
  const blockers: FinanceCloseBlockerDto[] = [];
  const { start, end } = financeClosePeriodBounds(scope);
  const relevantCards = facts.cards.filter((card) => !card.disposal || card.disposal.status !== "confirmed" || card.disposal.disposalDate >= start);
  if (relevantCards.length === 0) {
    const payload = { periodId, applicable: false, applicabilityEstablished: facts.applicabilityEstablished, assetGlBalance: money(facts.assetGlBalance), assetCount: 0 };
    if (!facts.applicabilityEstablished) return result("blocked", "asset-movements-close-v2", deepLink, payload, [issue("asset_applicability_unproven", "尚未配置公司年度资产政策，无法证明本期不适用资产增减关账", deepLink)]);
    if (moneyIsNonZero(facts.assetGlBalance)) return result("blocked", "asset-movements-close-v2", deepLink, payload, [issue("asset_cards_missing_with_gl_balance", "资产台账为空但年度政策资产科目存在余额", deepLink)]);
    return result("ready", "asset-movements-close-v2", deepLink, payload);
  }
  for (const card of relevantCards) {
    if (!card.acquisitionDate && !isControlledCutoverOpening(card, end)) {
      blockers.push(issue("asset_acquisition_date_missing", `资产 ${card.assetCode} 缺少取得日期，无法判断本期增减`, deepLink));
    }
    if (card.status !== "active" && (!card.disposal || card.disposal.status !== "confirmed")) blockers.push(issue("asset_disposal_fact_missing", `资产 ${card.assetCode} 状态为 ${card.status}，但缺少已确认处置事实`, scopedLink("adjustments", scope)));
    if (card.status === "active" && card.disposal?.status === "confirmed" && card.disposal.disposalDate <= end) blockers.push(issue("asset_disposal_status_inconsistent", `资产 ${card.assetCode} 已确认处置但卡片仍为使用中`, deepLink));
    const policy = policyByCategory.get(card.categoryId);
    if (!policy) blockers.push(issue("asset_policy_missing", `资产 ${card.assetCode} 的公司年度分类政策缺失或无效`, deepLink));
    else if (!policySnapshotMatches(card, policy)) blockers.push(issue("asset_policy_snapshot_mismatch", `资产 ${card.assetCode} 的科目快照与当前年度分类政策不一致`, deepLink));
  }
  const acquisitions = relevantCards.filter((card) => dateInFinanceClosePeriod(card.acquisitionDate, scope));
  const disposals = relevantCards.filter((card) => card.disposal?.status === "confirmed" && dateInFinanceClosePeriod(card.disposal.disposalDate, scope));
  const acquisitionEvidenceSummaries = acquisitions.map((card) => ({
    assetId: card.id,
    sourceFile: card.sourceFile,
    sourceRow: card.sourceRow,
    evidence: card.acquisitionEvidence ? acquisitionEvidenceSummary(card.acquisitionEvidence) : null,
  })).sort((left, right) => left.assetId - right.assetId);
  const disposalEvidenceSummaries: Array<Record<string, unknown>> = [];
  for (const card of acquisitions) {
    const evidence = card.acquisitionEvidence;
    const policy = policyByCategory.get(card.categoryId);
    if (!evidence) {
      blockers.push(issue("asset_acquisition_evidence_missing", `资产 ${card.assetCode} 缺少受控取得入账证据`, deepLink));
      continue;
    }
    if (!evidence.evidenceRef.trim() || !evidence.confirmedBy || evidence.version < 1 || !Number.isFinite(Date.parse(evidence.confirmedAt))) {
      blockers.push(issue("asset_acquisition_evidence_invalid", `资产 ${card.assetCode} 的取得证据缺少确认人、确认时间、版本或证据说明`, deepLink));
    }
    if (evidence.companyCode !== card.companyCode || evidence.companyCode !== scope.companyCode || !evidence.companyId || evidence.companyId !== card.companyId
      || evidence.periodId !== periodId || !moneyEquals(evidence.amount, card.originalCost)) {
      blockers.push(issue("asset_acquisition_evidence_scope_mismatch", `资产 ${card.assetCode} 的取得证据期间或金额与卡片不一致`, deepLink));
      continue;
    }
    if (evidence.voucherItem) {
      const item = evidence.voucherItem;
      const voucher = item.voucher;
      const counterparty = voucher.items.find((row) => row.id !== item.id) ?? null;
      if (!policy || moneyToCents(evidence.amount) <= 0 || item.accountCode !== policy.assetAccountCode
        || !moneyEquals(item.debit, evidence.amount) || !moneyIsZero(item.credit)
        || !counterparty || !moneyIsZero(counterparty.debit) || !moneyEquals(counterparty.credit, evidence.amount)
        || !postedVoucherInScope(voucher, periodId, scope.companyCode)
        || !moneyEquals(voucher.totalDebit, voucher.totalCredit)
        || !moneyEquals(voucher.totalDebit, evidence.amount)
        || !voucherItemsMatchTotals(voucher)
        || voucher.items.length !== 2
        || !voucher.items.some((row) => row.id === item.id)) {
        blockers.push(issue("asset_acquisition_voucher_invalid", `资产 ${card.assetCode} 的取得凭证明细未按公司年度资产政策完整入账`, deepLink));
      }
    } else if (evidence.importBatch) {
      const batch = evidence.importBatch;
      if (batch.status !== "confirmed" || batch.companyCode !== scope.companyCode || !batch.companyId || batch.companyId !== evidence.companyId || batch.sourceFile !== card.sourceFile
        || !card.sourceRow || !evidence.sourceChecksum || evidence.sourceChecksum !== batch.checksum) {
        blockers.push(issue("asset_acquisition_import_evidence_invalid", `资产 ${card.assetCode} 的导入批次证据与公司、来源校验和或源行不一致`, deepLink));
      }
    } else {
      blockers.push(issue("asset_acquisition_evidence_invalid", `资产 ${card.assetCode} 的取得证据未绑定唯一凭证明细或已确认导入批次`, deepLink));
    }
  }
  for (const card of disposals) {
    const disposal = card.disposal!;
    const policy = policyByCategory.get(card.categoryId);
    const replay = replayAssetAccumulatedAmounts({
      assetId: card.id,
      companyCode: scope.companyCode,
      openingAccumulatedAmount: card.openingAccumulatedAmount,
      openingImpairmentAmount: card.openingImpairmentAmount,
      openingIncludesImpairment: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE,
      openingAsOfDate: card.openingAsOfDate,
      priorEntries: facts.priorEntries,
      priorAdjustments: facts.priorAdjustments,
      priorImpairments: facts.priorImpairments,
    });
    for (const message of replay.blockers) blockers.push(issue("asset_disposal_basis_unprovable", `资产 ${card.assetCode}：${message}`, scopedLink("adjustments", scope)));
    const currentAccumulated = money(
      facts.entries.filter((row) => row.assetId === card.id).reduce((sum, row) => sum + row.normalAmount, 0)
      + facts.adjustments.filter((row) => row.assetId === card.id && row.status === "confirmed").reduce((sum, row) => sum + row.amount, 0),
    );
    const accumulated = money(replay.accumulatedBefore + currentAccumulated);
    const impairment = replay.impairmentBefore;
    const gainLoss = money(Number(card.originalCost) - accumulated - impairment - disposal.proceedsAmount);
    const currentEntryFacts = facts.entries.filter((row) => row.assetId === card.id).map((row) => ({
      id: row.id,
      amount: money(row.normalAmount),
      status: row.status,
      voucher: row.voucher ? fullVoucherSummary(row.voucher) : null,
    }));
    const currentAdjustmentFacts = facts.adjustments.filter((row) => row.assetId === card.id && row.status === "confirmed").map((row) => ({
      id: row.id,
      amount: money(row.amount),
      status: row.status,
      voucher: row.voucher ? fullVoucherSummary(row.voucher) : null,
    }));
    if (facts.entries.some((row) => row.assetId === card.id && moneyIsNonZero(row.normalAmount)
      && (row.status !== "posted" || !assetReplayVoucherIsControlled(row.voucher, scope.companyCode, periodId)))) {
      blockers.push(issue("asset_disposal_basis_unprovable", `资产 ${card.assetCode} 的本期折旧摊销缺少完整已过账凭证事实`, scopedLink("adjustments", scope)));
    }
    if (facts.adjustments.some((row) => row.assetId === card.id && row.status === "confirmed" && moneyIsNonZero(row.amount)
      && !assetReplayVoucherIsControlled(row.voucher, scope.companyCode, periodId))) {
      blockers.push(issue("asset_disposal_basis_unprovable", `资产 ${card.assetCode} 的本期折旧摊销调整缺少完整已过账凭证事实`, scopedLink("adjustments", scope)));
    }
    disposalEvidenceSummaries.push({
      assetId: card.id,
      disposalId: disposal.id,
      companyCode: disposal.companyCode,
      companyId: disposal.companyId,
      periodId: disposal.periodId,
      disposalDate: disposal.disposalDate,
      disposalType: disposal.disposalType,
      reason: disposal.reason,
      evidenceRef: disposal.evidenceRef,
      status: disposal.status,
      confirmedBy: disposal.confirmedBy,
      confirmedAt: disposal.confirmedAt,
      version: disposal.version,
      voucherId: disposal.voucherId,
      assetVoucherItemId: disposal.assetVoucherItemId,
      accumulatedVoucherItemId: disposal.accumulatedVoucherItemId,
      impairmentAllowanceVoucherItemId: disposal.impairmentAllowanceVoucherItemId,
      proceedsVoucherItemId: disposal.proceedsVoucherItemId,
      gainLossVoucherItemId: disposal.gainLossVoucherItemId,
      originalCost: money(card.originalCost),
      accumulated,
      impairment,
      proceeds: money(disposal.proceedsAmount),
      gainLoss,
      replayFingerprint: replay.basisFingerprint,
      currentEntries: currentEntryFacts,
      currentAdjustments: currentAdjustmentFacts,
      voucher: fullVoucherSummary(disposal.voucher),
    });
    if (disposal.companyCode !== scope.companyCode || !disposal.companyId || disposal.companyId !== card.companyId
      || !disposal.disposalType.trim() || !disposal.reason.trim() || !disposal.evidenceRef.trim()
      || !disposal.confirmedBy || disposal.version < 1 || !Number.isFinite(Date.parse(disposal.confirmedAt))) {
      blockers.push(issue("asset_disposal_evidence_invalid", `资产 ${card.assetCode} 的处置事实缺少公司范围、类型、原因或确认审计证据`, scopedLink("adjustments", scope)));
    }
    if (!policy || !disposalVoucherMatches({ card, disposal, policy, accumulated, impairment, gainLoss, periodId, companyCode: scope.companyCode })) {
      blockers.push(issue("asset_disposal_voucher_invalid", `资产 ${card.assetCode} 的处置专用凭证未按原值、累计金额、减值、收入和损益恒等式完整入账`, scopedLink("adjustments", scope)));
    }
  }
  const payload = {
    periodId,
    assetScopeFingerprint: assetScopeFingerprint(relevantCards),
    assetCount: relevantCards.length,
    acquisitionIds: acquisitions.map((card) => card.id).sort((left, right) => left - right),
    disposalIds: disposals.map((card) => card.disposal!.id).sort((left, right) => left - right),
    disposalVouchers: disposals.map((card) => ({ disposalId: card.disposal!.id, ...scopedVoucherSummary(card.disposal!.voucher) })).sort((left, right) => left.disposalId - right.disposalId),
    acquisitionEvidence: acquisitionEvidenceSummaries,
    disposalEvidence: disposalEvidenceSummaries.sort((left, right) => Number(left.assetId) - Number(right.assetId)),
    applicable: true,
    policies: relevantPolicies(relevantCards, facts.policies),
  };
  return result(
    blockers.length ? "blocked" : "ready",
    "asset-movements-close-v2",
    deepLink,
    payload,
    blockers,
    [...acquisitions.flatMap((card) => card.acquisitionEvidence ? [`finance-asset-acquisition-evidence:${card.acquisitionEvidence.id}`] : []), ...disposals.map((card) => `finance-asset-disposal:${card.disposal!.id}`)],
    [...acquisitions.flatMap((card) => card.acquisitionEvidence?.voucherItem ? [`finance-voucher:${card.acquisitionEvidence.voucherItem.voucher.id}`] : []), ...disposals.map((card) => `finance-voucher:${card.disposal!.voucherId}`)],
  );
}

export function inspectAssetDepreciationCloseFacts(
  scope: FinanceCloseScope,
  facts: AssetDepreciationCloseFacts,
): FinanceCloseProviderInspection {
  const deepLink = scopedLink("period", scope);
  if (!facts.period) {
    const payload = { scope, periodId: null };
    return result("blocked", "asset-depreciation-close-v2", deepLink, payload, [issue("asset_period_missing", "折旧摊销期间不存在", deepLink)]);
  }
  const periodId = facts.period.id;
  const { start, end } = financeClosePeriodBounds(scope);
  const policyByCategory = new Map(facts.policies.map((policy) => [policy.categoryId, policy]));
  const blockers: FinanceCloseBlockerDto[] = [];
  const relevantCards = facts.cards.filter((card) => !card.disposal || card.disposal.status !== "confirmed" || card.disposal.disposalDate >= start);
  const sourceClosedCutover = buildSourceClosedCutoverOutcome(scope, facts, relevantCards, end);
  if (sourceClosedCutover) {
    return result("ready", "asset-depreciation-close-v2+source-closed-cutover-v1", deepLink,
      sourceClosedCutover.payload, [], sourceClosedCutover.evidenceRefs, sourceClosedCutover.voucherRefs);
  }
  if (relevantCards.length === 0) {
    const payload = { periodId, applicable: false, applicabilityEstablished: facts.applicabilityEstablished, assetGlBalance: money(facts.assetGlBalance), assetCount: 0 };
    if (!facts.applicabilityEstablished) return result("blocked", "asset-depreciation-close-v2", deepLink, payload, [issue("asset_applicability_unproven", "尚未配置公司年度资产政策，无法证明本期不适用折旧摊销", deepLink)]);
    if (moneyIsNonZero(facts.assetGlBalance)) return result("blocked", "asset-depreciation-close-v2", deepLink, payload, [issue("asset_cards_missing_with_gl_balance", "资产台账为空但年度政策资产科目存在余额", deepLink)]);
    return result("ready", "asset-depreciation-close-v2", deepLink, payload);
  }
  const dueCards: AssetCloseCard[] = [];
  for (const card of relevantCards) {
    const confirmedDisposal = card.disposal?.status === "confirmed" ? card.disposal : null;
    if (confirmedDisposal && confirmedDisposal.disposalDate < start) continue;
    const policy = policyByCategory.get(card.categoryId);
    if (!policy) blockers.push(issue("asset_policy_missing", `资产 ${card.assetCode} 的公司年度分类政策缺失或无效`, deepLink));
    else if (!policySnapshotMatches(card, policy)) blockers.push(issue("asset_policy_snapshot_mismatch", `资产 ${card.assetCode} 的科目快照与当前年度分类政策不一致`, deepLink));
    else if (card.category.depreciable && !policy.expenseAccountCode) blockers.push(issue("asset_policy_expense_account_missing", `资产 ${card.assetCode} 的当前年度政策缺少折旧摊销费用科目`, deepLink));
    if (!card.acquisitionDate) blockers.push(issue("asset_acquisition_date_missing", `资产 ${card.assetCode} 缺少取得日期，无法证明目标期末范围`, deepLink));
    if (card.status !== "active" && !confirmedDisposal) {
      blockers.push(issue("asset_disposal_fact_missing", `资产 ${card.assetCode} 状态为 ${card.status}，但缺少已确认处置事实`, deepLink));
      continue;
    }
    if (card.status === "active" && confirmedDisposal && confirmedDisposal.disposalDate <= end) blockers.push(issue("asset_disposal_status_inconsistent", `资产 ${card.assetCode} 已确认处置但卡片仍为使用中`, deepLink));
    if (!card.category.depreciable) continue;
    if (card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE && card.cutoverAllocationStatus !== "allocated") {
      blockers.push(issue("asset_cutover_allocation_pending", `资产 ${card.assetCode} 的总账切点余额尚未归卡，不生成本期折旧摊销`, deepLink));
      continue;
    }
    if (card.usefulLifeMonths == null && card.initializationMode !== FINANCE_ASSET_LEGACY_CUTOVER_MODE) {
      if (card.assetKind !== "intangible" || !card.nonAmortizationReason?.trim()) {
        blockers.push(issue("asset_useful_life_missing", `资产 ${card.assetCode} 缺少折旧摊销期限或明确的不摊销依据`, deepLink));
      }
      continue;
    }
    if (!card.depreciationStartDate) {
      blockers.push(issue("asset_depreciation_start_missing", `资产 ${card.assetCode} 缺少折旧摊销起算日期`, deepLink));
      continue;
    }
    if (card.depreciationStartDate <= end) dueCards.push(card);
  }

  const entryByAssetId = new Map(facts.entries.map((entry) => [entry.assetId, entry]));
  const dueIds = new Set(dueCards.map((card) => card.id));
  const expectedRows: Array<{ assetId: number; expectedNormalAmount: number; storedNormalAmount: number | null; difference: number | null }> = [];
  for (const card of dueCards) {
    const entry = entryByAssetId.get(card.id);
    const replayBasis = replayAssetAccumulatedAmounts({
      assetId: card.id,
      companyCode: scope.companyCode,
      openingAccumulatedAmount: card.openingAccumulatedAmount,
      openingImpairmentAmount: card.openingImpairmentAmount,
      openingIncludesImpairment: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE,
      openingAsOfDate: card.openingAsOfDate,
      priorEntries: facts.priorEntries,
      priorAdjustments: facts.priorAdjustments,
      priorImpairments: facts.priorImpairments,
    });
    for (const message of replayBasis.blockers) blockers.push(issue("asset_accumulated_replay_blocked", `资产 ${card.assetCode}：${message}`, deepLink));
    const replay = calculateFinanceAssetPeriod({
      originalCost: money(card.originalCost),
      residualRate: Number(card.residualRate),
      usefulLifeMonths: card.usefulLifeMonths ?? card.remainingUsefulLifeMonthsAtCutover!,
      accumulatedBefore: replayBasis.accumulatedBefore,
      impairmentBefore: replayBasis.impairmentBefore,
      depreciationStartDate: card.depreciationStartDate!,
      year: scope.year,
      month: scope.month,
      assetKind: card.assetKind as "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred",
      disposalDate: resolveConfirmedDisposalDate(card),
      initializationMode: card.initializationMode as "standard" | "legacy_cutover",
      legacyCutover: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE ? {
        originalCost: money(card.originalCost),
        openingAccumulatedAmount: money(card.openingAccumulatedAmount),
        openingImpairmentAmount: money(card.openingImpairmentAmount),
        openingNetBookValue: money(card.openingNetBookValue),
        cutoverDate: card.cutoverDate!,
        remainingUsefulLifeMonthsAtCutover: card.remainingUsefulLifeMonthsAtCutover!,
        cutoverResidualValue: money(card.cutoverResidualValue),
      } : undefined,
    });
    const expected = replay.periodAmount;
    if (replay.lifecycleBlocker) blockers.push(issue(replay.lifecycleBlocker, `资产 ${card.assetCode} 的处置月终止摊销口径缺失，需通过明确政策或调整事实处理`, deepLink));
    expectedRows.push({ assetId: card.id, expectedNormalAmount: expected, storedNormalAmount: entry ? money(entry.normalAmount) : null, difference: entry ? money(entry.normalAmount - expected) : null });
    if (!entry) {
      blockers.push(issue("asset_period_entry_missing", `资产 ${card.assetCode} 缺少本期折旧摊销条目`, deepLink));
      continue;
    }
    if (!moneyEquals(entry.normalAmount, expected)) blockers.push(issue("asset_period_calculation_difference", `资产 ${card.assetCode} 的本期折旧摊销金额与政策重算结果不一致`, deepLink));
    if (moneyIsNonZero(entry.normalAmount) && (entry.status !== "posted" || !postedVoucherInScope(entry.voucher, periodId, scope.companyCode))) {
      blockers.push(issue("asset_period_voucher_missing", `资产 ${card.assetCode} 的非零折旧摊销条目必须为已过账并关联本期专用凭证`, deepLink));
    } else if (moneyIsZero(entry.normalAmount) && !["calculated", "confirmed", "posted"].includes(entry.status)) {
      blockers.push(issue("asset_period_entry_status_invalid", `资产 ${card.assetCode} 的零额折旧摊销条目状态无效`, deepLink));
    }
  }
  for (const entry of facts.entries) {
    if (!dueIds.has(entry.assetId) && moneyIsNonZero(entry.normalAmount)) {
      blockers.push(issue("asset_period_entry_out_of_scope", `折旧摊销条目 ${entry.id} 对应资产不在本期应计范围`, deepLink));
    }
  }
  const confirmedAdjustments = facts.adjustments.filter((adjustment) => adjustment.status === "confirmed");
  for (const adjustment of confirmedAdjustments) {
    if (!postedVoucherInScope(adjustment.voucher, periodId, scope.companyCode)) {
      blockers.push(issue("asset_adjustment_voucher_missing", `已确认折旧摊销调整 ${adjustment.id} 未关联同期间已过账凭证`, deepLink));
    }
    if (moneyIsNonZero(adjustment.amount)) {
      const card = adjustment.assetId == null ? null : relevantCards.find((row) => row.id === adjustment.assetId);
      const policy = card ? policyByCategory.get(card.categoryId) : null;
      if (!card || !policy?.expenseAccountCode) blockers.push(issue("asset_adjustment_policy_unresolved", `已确认折旧摊销调整 ${adjustment.id} 未分配资产或无法解析当前年度费用科目`, deepLink));
    }
  }
  for (const adjustment of facts.adjustments) {
    if (!["confirmed", "reversed"].includes(adjustment.status)) blockers.push(issue("asset_adjustment_status_pending", `折旧摊销调整 ${adjustment.id} 尚未确认或冲销`, deepLink));
  }
  const linkedRows = [
    ...facts.entries.filter((entry) => moneyIsNonZero(entry.normalAmount)).map((entry) => entry.voucher),
    ...confirmedAdjustments.filter((adjustment) => moneyIsNonZero(adjustment.amount)).map((adjustment) => adjustment.voucher),
  ];
  const scheduleByAccount = new Map<string, number>();
  const expenseScheduleByAccount = new Map<string, number>();
  for (const card of relevantCards) {
    const policy = policyByCategory.get(card.categoryId);
    if (policy) {
      accumulateAmount(scheduleByAccount, policy.accumulatedAccountCode ?? policy.assetAccountCode, 0);
      if (policy.expenseAccountCode) accumulateAmount(expenseScheduleByAccount, policy.expenseAccountCode, 0);
    }
  }
  for (const entry of facts.entries) {
    const card = relevantCards.find((row) => row.id === entry.assetId);
    const policy = card ? policyByCategory.get(card.categoryId) : null;
    if (policy) {
      accumulateAmount(scheduleByAccount, policy.accumulatedAccountCode ?? policy.assetAccountCode, entry.normalAmount);
      if (policy.expenseAccountCode) accumulateAmount(expenseScheduleByAccount, policy.expenseAccountCode, entry.normalAmount);
    }
  }
  for (const adjustment of confirmedAdjustments) {
    accumulateAmount(scheduleByAccount, adjustment.accountCode, adjustment.amount);
    const card = adjustment.assetId == null ? null : relevantCards.find((row) => row.id === adjustment.assetId);
    const policy = card ? policyByCategory.get(card.categoryId) : null;
    if (policy?.expenseAccountCode) accumulateAmount(expenseScheduleByAccount, policy.expenseAccountCode, adjustment.amount);
  }
  const linkedVoucherIds = new Set(linkedRows.flatMap((voucher) => voucher ? [voucher.id] : []));
  if (linkedRows.length > 0 && (linkedRows.some((voucher) => !voucher) || linkedVoucherIds.size !== 1)) {
    blockers.push(issue("asset_period_dedicated_voucher_required", "本期非零折旧摊销与已确认调整必须关联同一张专用凭证", deepLink));
  } else if (linkedRows.length > 0) {
    const voucher = linkedRows.find((row): row is AssetDepreciationVoucherFact => Boolean(row))!;
    const voucherByAccount = new Map<string, number>();
    const voucherDebitByAccount = new Map<string, number>();
    for (const item of voucher.items) accumulateAmount(voucherByAccount, item.accountCode, item.credit - item.debit);
    for (const item of voucher.items) accumulateAmount(voucherDebitByAccount, item.accountCode, item.debit - item.credit);
    const scheduleTotal = money([...scheduleByAccount.values()].reduce((sum, amount) => sum + amount, 0));
    if (!voucherItemsMatchTotals(voucher)
      || !voucherItemsAreFullyConsumed(voucher, new Set(expenseScheduleByAccount.keys()), new Set(scheduleByAccount.keys()))
      || !moneyEquals(voucher.totalDebit, voucher.totalCredit) || !moneyEquals(voucher.totalDebit, scheduleTotal)
      || [...scheduleByAccount].some(([accountCode, amount]) => !moneyEquals(voucherByAccount.get(accountCode) ?? 0, amount))
      || [...expenseScheduleByAccount].some(([accountCode, amount]) => !moneyEquals(voucherDebitByAccount.get(accountCode) ?? 0, amount))) {
      blockers.push(issue("asset_period_dedicated_voucher_mismatch", "折旧摊销专用凭证整张借贷总额或累计科目金额与本期台账不一致", deepLink));
    }
  }
  const ledgerByAccount = new Map(facts.ledgerByAccount.map((row) => [row.accountCode, row.amount]));
  for (const [accountCode, amount] of scheduleByAccount) {
    if (!moneyEquals(ledgerByAccount.get(accountCode) ?? 0, amount)) blockers.push(issue("asset_ledger_reconciliation_difference", `累计折旧/摊销科目 ${accountCode} 与本期总账发生额不一致`, scopedLink("period", scope)));
  }
  const payload = {
    periodId,
    assetScopeFingerprint: assetScopeFingerprint(relevantCards),
    dueAssetIds: [...dueIds].sort((left, right) => left - right),
    entries: facts.entries.map((entry) => ({ id: entry.id, assetId: entry.assetId, normalAmount: money(entry.normalAmount), status: entry.status, voucherId: entry.voucher?.id ?? null })).sort((left, right) => left.id - right.id),
    confirmedAdjustments: confirmedAdjustments.map((adjustment) => ({ id: adjustment.id, amount: money(adjustment.amount), voucherId: adjustment.voucher?.id ?? null })).sort((left, right) => left.id - right.id),
    calculationReplay: expectedRows.sort((left, right) => left.assetId - right.assetId),
    ledgerByAccount: facts.ledgerByAccount.slice().sort((left, right) => left.accountCode.localeCompare(right.accountCode)),
    vouchers: uniqueDepreciationVouchers(linkedRows),
    applicable: true,
    policies: relevantPolicies(relevantCards, facts.policies),
  };
  const evidenceRefs = [
    ...facts.entries.map((entry) => `finance-asset-period-entry:${entry.id}`),
    ...confirmedAdjustments.map((adjustment) => `finance-asset-adjustment:${adjustment.id}`),
  ];
  const voucherRefs = [
    ...facts.entries.flatMap((entry) => entry.voucher ? [`finance-voucher:${entry.voucher.id}`] : []),
    ...confirmedAdjustments.flatMap((adjustment) => adjustment.voucher ? [`finance-voucher:${adjustment.voucher.id}`] : []),
  ];
  return result(blockers.length ? "blocked" : "ready", "asset-depreciation-close-v2", deepLink, payload, blockers, evidenceRefs, voucherRefs);
}

export function inspectAssetImpairmentCloseFacts(
  scope: FinanceCloseScope,
  facts: AssetImpairmentCloseFacts,
): FinanceCloseProviderInspection {
  const deepLink = scopedLink("adjustments", scope);
  if (!facts.period) {
    const payload = { scope, periodId: null };
    return result("blocked", "asset-impairment-close-v2", deepLink, payload, [issue("asset_period_missing", "资产减值评估期间不存在", deepLink)]);
  }
  const periodId = facts.period.id;
  if (!facts.assessment) {
    const payload = { periodId, assetScopeFingerprint: assetScopeFingerprint(facts.cards), assetCount: facts.cards.length, assessmentId: null };
    return result("pending", "asset-impairment-close-v2", deepLink, payload);
  }
  const assessment = facts.assessment;
  const currentFingerprint = assetScopeFingerprint(facts.cards);
  const blockers: FinanceCloseBlockerDto[] = [];
  const { end } = financeClosePeriodBounds(scope);
  const entryAssetIds = new Set(facts.entries.map((entry) => entry.assetId));
  for (const card of facts.cards) {
    if (card.category.depreciable && card.usefulLifeMonths != null && card.depreciationStartDate && card.depreciationStartDate <= end && !entryAssetIds.has(card.id)) {
      blockers.push(issue("asset_impairment_basis_unlocked", `资产 ${card.assetCode} 尚未生成本期折旧摊销，不能锁定期末减值基础`, deepLink));
    }
  }
  const replayRows = facts.cards.map((card) => {
    const replay = replayAssetAccumulatedAmounts({
      assetId: card.id,
      companyCode: scope.companyCode,
      openingAccumulatedAmount: card.openingAccumulatedAmount,
      openingImpairmentAmount: card.openingImpairmentAmount,
      openingIncludesImpairment: card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE,
      openingAsOfDate: card.openingAsOfDate,
      priorEntries: facts.priorEntries,
      priorAdjustments: facts.priorAdjustments,
      priorImpairments: facts.priorImpairments,
    });
    for (const message of replay.blockers) blockers.push(issue("asset_impairment_basis_unprovable", `资产 ${card.assetCode}：${message}`, deepLink));
    return { assetId: card.id, replayFingerprint: replay.basisFingerprint };
  });
  const currentBasisFingerprint = assetImpairmentCalculationBasisFingerprint({
    assets: replayRows,
    entries: facts.entries.map((row) => ({ id: row.id, assetId: row.assetId, amount: row.normalAmount, status: row.status, voucherId: row.voucher?.id ?? null })),
    adjustments: facts.adjustments.map((row) => ({ id: row.id, assetId: row.assetId, amount: row.amount, status: row.status, voucherId: row.voucher?.id ?? null })),
  });
  if (facts.entries.some((entry) => moneyIsNonZero(entry.normalAmount) && (entry.status !== "posted" || !postedVoucherInScope(entry.voucher, periodId, scope.companyCode)))) {
    blockers.push(issue("asset_impairment_basis_unlocked", "本期非零折旧摊销尚未通过专用凭证过账，不能锁定期末减值基础", deepLink));
  }
  if (facts.adjustments.some((adjustment) => adjustment.status === "confirmed" && moneyIsNonZero(adjustment.amount) && !postedVoucherInScope(adjustment.voucher, periodId, scope.companyCode))) {
    blockers.push(issue("asset_impairment_basis_unlocked", "本期折旧摊销调整尚未过账，不能锁定期末减值基础", deepLink));
  }
  if (assessment.status !== "confirmed") blockers.push(issue("asset_impairment_unconfirmed", "本期资产减值评估尚未确认", deepLink));
  if (!assessment.basis.trim() || !assessment.evidenceRef.trim()) blockers.push(issue("asset_impairment_evidence_missing", "本期资产减值评估缺少依据或证据引用", deepLink));
  if (assessment.assetScopeFingerprint !== currentFingerprint || assessment.assetCount !== facts.cards.length) {
    blockers.push(issue("asset_impairment_scope_stale", "资产范围已变化，必须重新确认本期减值评估", deepLink));
  }
  if (assessment.calculationBasisFingerprint !== currentBasisFingerprint) {
    blockers.push(issue("asset_impairment_basis_stale", "折旧摊销或历史累计基础已变化，必须重新确认本期减值评估", deepLink));
  }
  if (!["no_indication", "no_impairment", "impairment_recorded"].includes(assessment.conclusion)) {
    blockers.push(issue("asset_impairment_conclusion_invalid", "本期资产减值评估结论无效", deepLink));
  }
  if (assessment.conclusion === "impairment_recorded") {
    if (assessment.impairmentAmount <= 0 || !impairmentVoucherMatches(assessment.voucher, periodId, scope.companyCode, assessment.impairmentAmount, assessment.allocations, facts.cards, facts.policies)) {
      blockers.push(issue("asset_impairment_voucher_mismatch", "已确认减值必须按公司年度政策的减值损失/准备科目形成同期间整张专用凭证", deepLink));
    }
    const scopeIds = new Set(facts.cards.map((card) => card.id));
    const allocationIds = assessment.allocations.map((row) => row.assetId);
    const allocationTotal = money(assessment.allocations.reduce((sum, row) => sum + row.amount, 0));
    if (assessment.allocations.length === 0 || new Set(allocationIds).size !== allocationIds.length
      || assessment.allocations.some((row) => !scopeIds.has(row.assetId) || moneyToCents(row.amount) <= 0)
      || !moneyEquals(allocationTotal, assessment.impairmentAmount)) {
      blockers.push(issue("asset_impairment_allocation_mismatch", "资产减值分配必须逐项属于本期范围且合计等于减值总额", deepLink));
    }
  } else if (assessment.impairmentAmount !== 0 || assessment.voucher || assessment.allocations.length > 0) {
    blockers.push(issue("asset_impairment_amount_unexpected", "未确认减值时不得保留减值金额或凭证", deepLink));
  }
  const payload = {
    periodId,
    assessmentId: assessment.id,
    assessmentVersion: assessment.version,
    status: assessment.status,
    conclusion: assessment.conclusion,
    basis: assessment.basis,
    impairmentAmount: money(assessment.impairmentAmount),
    evidenceRef: assessment.evidenceRef,
    recordedAssetScopeFingerprint: assessment.assetScopeFingerprint,
    currentAssetScopeFingerprint: currentFingerprint,
    recordedCalculationBasisFingerprint: assessment.calculationBasisFingerprint,
    currentCalculationBasisFingerprint: currentBasisFingerprint,
    recordedAssetCount: assessment.assetCount,
    assetCount: facts.cards.length,
    voucherId: assessment.voucher?.id ?? null,
    voucher: assessment.voucher ? impairmentVoucherSummary(assessment.voucher) : null,
    allocations: assessment.allocations.map((row) => ({ assetId: row.assetId, amount: money(row.amount) })).sort((left, right) => left.assetId - right.assetId),
  };
  return result(
    blockers.length ? "blocked" : "ready",
    "asset-impairment-close-v2",
    deepLink,
    payload,
    blockers,
    [`finance-asset-impairment-assessment:${assessment.id}`, `finance-asset-impairment-evidence:${assessment.evidenceRef}`],
    assessment.voucher ? [`finance-voucher:${assessment.voucher.id}`] : [],
  );
}

const assetProviders = buildFinanceAssetCloseProviders({
  movement: inspectAssetMovementCloseFacts,
  depreciation: inspectAssetDepreciationCloseFacts,
  impairment: inspectAssetImpairmentCloseFacts,
});
export const assetMovementCloseProvider = assetProviders.movement;
export const assetDepreciationCloseProvider = assetProviders.depreciation;
export const assetImpairmentCloseProvider = assetProviders.impairment;
export const FINANCE_ASSET_CLOSE_PROVIDERS = {
  "finance.assets.movements": assetMovementCloseProvider,
  "finance.assets.depreciation": assetDepreciationCloseProvider,
  "finance.assets.impairment": assetImpairmentCloseProvider,
} as const;
