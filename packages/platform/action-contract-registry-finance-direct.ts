import { defineActionContractMetadataList, type ActionMutationDomainBindingReference } from "./action-contract";
import { registeredActionFacts, registeredImport, registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const d = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({ validatorKey, commitKey });
const financeValidation = (name: string) => `packages/finance/server/domain/finance-validation.${name}`;
const routeCommand = (name: string) => `packages/finance/server/route-commands.${name}`;
const consolidationRouteCommand = (name: string) => `packages/finance/server/statements/consolidation-route-commands.${name}`;

export const FINANCE_DIRECT_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  registeredWrite({ key: "finance.ledger.account.create", activeEntity: "FinanceAccount", domain: d(financeValidation("buildFinanceAccountCreateCommand"), "packages/finance/server/ledger/accounts.createFinanceAccount"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.account.update", activeEntity: "FinanceAccount", domain: d(financeValidation("buildFinanceAccountUpdateCommand"), "packages/finance/server/ledger/accounts.updateFinanceAccount") }),
  registeredLifecycle({ key: "finance.ledger.account.delete", activeEntity: "FinanceAccount", operation: "delete", domain: d(financeValidation("buildFinanceIdCommand"), "packages/finance/server/ledger/accounts.deleteFinanceAccount"), referencePolicy: "domain" }),
  registeredWrite({ key: "finance.ledger.voucher.create", activeEntity: "FinanceVoucher", domain: d(routeCommand("buildCreateVoucherCommand"), routeCommand("executeCreateVoucherCommand")), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.voucher.update", activeEntity: "FinanceVoucher", domain: d(routeCommand("buildUpdateVoucherCommand"), routeCommand("executeUpdateVoucherCommand")) }),
  registeredLifecycle({ key: "finance.ledger.voucher.delete", activeEntity: "FinanceVoucher", operation: "delete", domain: d(financeValidation("buildFinanceIdCommand"), routeCommand("executeDeleteVoucherCommand")), referencePolicy: "domain" }),
  registeredWrite({ key: "finance.ledger.period.create", activeEntity: "FinancePeriod", domain: d(financeValidation("buildFinancePeriodCreateCommand"), "packages/finance/server/ledger/periods.createFinancePeriod"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.period.update", activeEntity: "FinancePeriod", domain: d(financeValidation("buildFinancePeriodUpdateCommand"), "packages/finance/server/ledger/periods.updateFinancePeriod") }),
  registeredLifecycle({ key: "finance.ledger.period.delete", activeEntity: "FinancePeriod", operation: "delete", domain: d(financeValidation("buildFinanceIdCommand"), "packages/finance/server/ledger/periods.deleteFinancePeriod"), referencePolicy: "domain" }),
  registeredWrite({ key: "finance.ledger.defaultBook.create", activeEntity: "FinanceLedgerDefaultBook", domain: d(routeCommand("buildInitializeFinanceDefaultsCommand"), routeCommand("executeInitializeFinanceDefaultsCommand")), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.balance.revise", activeEntity: "FinanceAccountBalance", domain: d(financeValidation("buildBalanceComputeCommand"), routeCommand("executeRecomputeFinanceBalancesCommand")), shape: "change_set", commitMode: "native_transition" }),
  {
    ...registeredActionFacts("finance.ledger.workspace.export"),
    kind: "exchange",
    payload: {
      cardinality: "batch",
      shape: "full_record",
      target: "mixed",
      notes: "按当前总账页面的公司、期间、关键词和分类筛选导出全部匹配行，不受当前分页限制。",
    },
    exchange: {
      direction: "export",
      transport: "file",
      result: "file",
      contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    },
    domain: {
      bindings: [{
        validatorKey: "packages/finance/server/ledger/ledger-export-route-commands.buildLedgerExportCommand",
        executeKey: "packages/finance/server/ledger/ledger-export-route-commands.executeLedgerExportCommand",
      }],
    },
  },
  registeredWrite({ key: "finance.ledger.groupAccount.create", activeEntity: "FinanceGroupAccount", domain: d("packages/finance/server/ledger/group-accounts/route-commands.buildCreateFinanceGroupAccountRouteCommand", "packages/finance/server/ledger/group-accounts/route-commands.executeCreateFinanceGroupAccountRouteCommand"), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.groupAccount.update", activeEntity: "FinanceGroupAccount", domain: d("packages/finance/server/ledger/group-accounts/route-commands.buildUpdateFinanceGroupAccountRouteCommand", "packages/finance/server/ledger/group-accounts/route-commands.executeUpdateFinanceGroupAccountRouteCommand") }),
  registeredLifecycle({ key: "finance.ledger.groupAccount.delete", activeEntity: "FinanceGroupAccount", operation: "delete", domain: d("packages/finance/server/ledger/group-accounts/route-commands.buildDeleteFinanceGroupAccountRouteCommand", "packages/finance/server/ledger/group-accounts/route-commands.executeDeleteFinanceGroupAccountRouteCommand"), referencePolicy: "domain" }),
  registeredWrite({ key: "finance.ledger.groupAccount.review", activeEntity: "FinanceGroupAccount", domain: d("packages/finance/server/ledger/group-accounts/route-commands.buildReviewFinanceGroupAccountRouteCommand", "packages/finance/server/ledger/group-accounts/route-commands.executeReviewFinanceGroupAccountRouteCommand"), commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.groupAccountMapping.save", activeEntity: "FinanceGroupAccountMapping", domain: d("packages/finance/server/ledger/group-accounts/route-commands.buildSaveFinanceGroupAccountMappingChangeSetRouteCommand", "packages/finance/server/ledger/group-accounts/route-commands.executeSaveFinanceGroupAccountMappingChangeSetRouteCommand"), shape: "change_set", target: "existing_record", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassRule.save", activeEntity: "FinanceReclassRule", domain: d(routeCommand("buildSaveReclassRuleChangeSetRouteCommand"), routeCommand("executeSaveReclassRuleChangeSetRouteCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassAdjustment.save", activeEntity: "FinanceBalanceReclassAdjustment", domain: d(routeCommand("buildSaveBalanceReclassAdjustmentChangeSetRouteCommand"), routeCommand("executeSaveBalanceReclassAdjustmentChangeSetRouteCommand")), shape: "change_set", target: "existing_record", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassResult.generate", activeEntity: "ReclassResult", domain: d(routeCommand("buildBuildReclassResultsCommand"), routeCommand("executeBuildReclassResultsCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassResult.adjust", activeEntity: "ReclassResult", domain: d(routeCommand("buildReclassResultPatchCommand"), routeCommand("executeReclassResultPatchCommand")), commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.asset.create", activeEntity: "FinanceAssetCard", domain: d("packages/finance/server/assets/route-commands.buildCreateFinanceAssetCardRouteCommand", "packages/finance/server/assets/route-commands.executeCreateFinanceAssetCardRouteCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.asset.update", activeEntity: "FinanceAssetCard", domain: d("packages/finance/server/assets/route-commands.buildUpdateFinanceAssetCardRouteCommand", "packages/finance/server/assets/route-commands.executeUpdateFinanceAssetCardRouteCommand") }),
  registeredWrite({ key: "finance.ledger.assetAdjustment.create", activeEntity: "FinanceAssetAdjustment", domain: d("packages/finance/server/assets/route-commands.buildCreateFinanceAssetAdjustmentRouteCommand", "packages/finance/server/assets/route-commands.executeCreateFinanceAssetAdjustmentRouteCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.ledger.assetPeriod.recalculate", activeEntity: "FinanceAssetPeriodEntry", domain: d("packages/finance/server/assets/route-commands.buildRecalculateFinanceAssetPeriodRouteCommand", "packages/finance/server/assets/route-commands.executeRecalculateFinanceAssetPeriodCommand"), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  {
    ...registeredActionFacts("finance.statements.report.export"),
    kind: "exchange",
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "mixed",
      notes: "单体报表按公司和期间生成，合并报表按当前合并批次生成；文件固定包含资产负债表、利润表、现金流量表三张工作表。",
    },
    exchange: {
      direction: "export",
      transport: "file",
      result: "file",
      contentTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    },
    domain: {
      bindings: [
        {
          validatorKey: "packages/finance/server/statements/statement-export-route-commands.buildStandaloneStatementExportCommand",
          executeKey: "packages/finance/server/statements/statement-export-route-commands.executeStandaloneStatementExportCommand",
        },
        {
          validatorKey: "packages/finance/server/statements/statement-export-route-commands.buildConsolidatedStatementExportCommand",
          executeKey: "packages/finance/server/statements/statement-export-route-commands.executeConsolidatedStatementExportCommand",
        },
      ],
    },
  },
  registeredWrite({ key: "finance.statements.exchangeRate.save", activeEntity: "FinanceStatementExchangeRate", domain: d("packages/finance/server/statements/exchange-rate-route-commands.buildRefreshStatementExchangeRateRouteCommand", "packages/finance/server/statements/exchange-rate-route-commands.executeRefreshStatementExchangeRateRouteCommand"), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.statements.consolidationBatch.ensure", activeEntity: "FinanceConsolidationBatch", domain: d(consolidationRouteCommand("buildEnsureConsolidationBatchRouteCommand"), consolidationRouteCommand("executeEnsureConsolidationBatchRouteCommand")), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.delete", activeEntity: "FinanceConsolidationBatch", operation: "delete", targetIdKey: "batchId", versionKey: "expectedRevision", deleteMode: "hard", domain: d(consolidationRouteCommand("buildDeleteConsolidationBatchRouteCommand"), consolidationRouteCommand("executeDeleteConsolidationBatchRouteCommand")), referencePolicy: "domain", auditPolicy: "none" }),
  registeredWrite({ key: "finance.statements.consolidationSources.save", activeEntity: "FinanceConsolidationSourceSnapshot", domain: d(consolidationRouteCommand("buildSaveConsolidationSourcesRouteCommand"), consolidationRouteCommand("executeSaveConsolidationSourcesRouteCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.statements.consolidationControl.resolve", activeEntity: "FinanceConsolidationControlDecision", domain: d(consolidationRouteCommand("buildSaveConsolidationControlDecisionRouteCommand"), consolidationRouteCommand("executeSaveConsolidationControlDecisionRouteCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.statements.consolidationEntry.save", activeEntity: "FinanceConsolidationEntry", domain: d(consolidationRouteCommand("buildSaveConsolidationEntryRouteCommand"), consolidationRouteCommand("executeSaveConsolidationEntryRouteCommand")), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  registeredLifecycle({ key: "finance.statements.consolidationEntry.approve", activeEntity: "FinanceConsolidationEntry", operation: "approve", targetIdKey: "entryId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildApproveConsolidationEntryRouteCommand"), consolidationRouteCommand("executeReviewConsolidationEntryRouteCommand")), auditPolicy: "event" }),
  registeredLifecycle({ key: "finance.statements.consolidationEntry.return", activeEntity: "FinanceConsolidationEntry", operation: "custom", targetIdKey: "entryId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildReturnConsolidationEntryRouteCommand"), consolidationRouteCommand("executeReviewConsolidationEntryRouteCommand")), auditPolicy: "event" }),
  registeredLifecycle({ key: "finance.statements.consolidationEntry.delete", activeEntity: "FinanceConsolidationEntry", operation: "delete", targetIdKey: "entryId", versionKey: "expectedRevision", deleteMode: "hard", domain: d(consolidationRouteCommand("buildDeleteConsolidationEntryRouteCommand"), consolidationRouteCommand("executeDeleteConsolidationEntryRouteCommand")), referencePolicy: "domain", auditPolicy: "event" }),
  registeredWrite({ key: "finance.statements.consolidationTaxEffect.save", activeEntity: "FinanceConsolidationTaxEffect", domain: d(consolidationRouteCommand("buildSaveConsolidationTaxEffectRouteCommand"), consolidationRouteCommand("executeSaveConsolidationTaxEffectRouteCommand")), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  registeredLifecycle({ key: "finance.statements.consolidationTaxEffect.delete", activeEntity: "FinanceConsolidationTaxEffect", operation: "delete", targetIdKey: "taxEffectId", versionKey: "expectedRevision", deleteMode: "hard", domain: d(consolidationRouteCommand("buildDeleteConsolidationTaxEffectRouteCommand"), consolidationRouteCommand("executeDeleteConsolidationTaxEffectRouteCommand")), referencePolicy: "domain", auditPolicy: "event" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.submit", activeEntity: "FinanceConsolidationBatch", operation: "submit", targetIdKey: "batchId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildSubmitConsolidationBatchRouteCommand"), consolidationRouteCommand("executeConsolidationBatchLifecycleRouteCommand")), auditPolicy: "history" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.return", activeEntity: "FinanceConsolidationBatch", operation: "custom", targetIdKey: "batchId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildReturnConsolidationBatchRouteCommand"), consolidationRouteCommand("executeConsolidationBatchLifecycleRouteCommand")), auditPolicy: "history" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.review", activeEntity: "FinanceConsolidationBatch", operation: "approve", targetIdKey: "batchId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildReviewConsolidationBatchRouteCommand"), consolidationRouteCommand("executeConsolidationBatchLifecycleRouteCommand")), auditPolicy: "history" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.lock", activeEntity: "FinanceConsolidationBatch", operation: "custom", targetIdKey: "batchId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildLockConsolidationBatchRouteCommand"), consolidationRouteCommand("executeConsolidationBatchLifecycleRouteCommand")), auditPolicy: "history" }),
  registeredLifecycle({ key: "finance.statements.consolidationBatch.publish", activeEntity: "FinanceConsolidationBatch", operation: "custom", targetIdKey: "batchId", versionKey: "expectedRevision", domain: d(consolidationRouteCommand("buildPublishConsolidationBatchRouteCommand"), consolidationRouteCommand("executeConsolidationBatchLifecycleRouteCommand")), auditPolicy: "history" }),

  registeredImport({ key: "finance.budget.import", activeEntity: "FinanceBudget", transport: "file", domain: d(financeValidation("buildBudgetImportCommand"), "packages/finance/server/budget/service.importBudgetWorkbook") }),
  registeredWrite({ key: "finance.budget.version.create", activeEntity: "BudgetVersion", domain: d(financeValidation("buildBudgetVersionCreateCommand"), "packages/finance/server/budget/budget-version.createBudgetVersion"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredLifecycle({ key: "finance.budget.version.activate", activeEntity: "BudgetVersion", operation: "activate", domain: d(financeValidation("buildFinanceIdCommand"), "packages/finance/server/budget/budget-version.activateBudgetVersion"), auditPolicy: "event" }),
  registeredLifecycle({ key: "finance.cost.import.delete", activeEntity: "FinanceCostImport", operation: "delete", domain: d(routeCommand("buildFinanceActorRouteIdCommand"), routeCommand("executeDeleteCostImportCommand")), referencePolicy: "domain" }),
  registeredWrite({ key: "finance.operationalAnalytics.template.draft.create", activeEntity: "WorkspaceAnalysisTemplate", domain: d("packages/finance/server/domain/operational-analysis-template-validation.validateOperationalAnalysisTemplate", "packages/finance/server/cost/operational-analysis-templates.saveOperationalAnalysisTemplate"), shape: "full_record", target: "new_record", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.operationalAnalytics.template.draft.update", activeEntity: "WorkspaceAnalysisTemplate", domain: d("packages/finance/server/domain/operational-analysis-template-validation.validateOperationalAnalysisTemplate", "packages/finance/server/cost/operational-analysis-templates.saveOperationalAnalysisTemplate"), shape: "full_record", target: "existing_record", targetIdKey: "templateId", commitMode: "native_transition" }),
  registeredLifecycle({ key: "finance.operationalAnalytics.template.lifecycle", activeEntity: "WorkspaceAnalysisTemplate", operation: "custom", targetIdKey: "templateId", versionKey: "expectedRevision", domain: d("packages/finance/server/domain/operational-analysis-template-lifecycle-validation.planOperationalAnalysisTemplateLifecycle", "packages/finance/server/cost/operational-analysis-template-lifecycle.executeOperationalAnalysisTemplateLifecycle"), auditPolicy: "history" }),
]);
