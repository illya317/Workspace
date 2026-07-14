import { defineActionContractMetadataList, type ActionMutationDomainBindingReference } from "./action-contract";
import { registeredImport, registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const d = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({ validatorKey, commitKey });
const financeValidation = (name: string) => `packages/finance/server/domain/finance-validation.${name}`;
const routeCommand = (name: string) => `packages/finance/server/route-commands.${name}`;

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
  registeredImport({ key: "finance.ledger.balance.reconcile", activeEntity: "FinanceBalanceSnapshot", transport: "file", domain: d(routeCommand("buildReconcileBalanceSheetCommand"), routeCommand("executeReconcileBalanceSheetCommand")) }),
  registeredWrite({ key: "finance.ledger.reclassRule.save", activeEntity: "FinanceReclassRule", domain: d(routeCommand("buildSaveReclassRuleChangeSetRouteCommand"), routeCommand("executeSaveReclassRuleChangeSetRouteCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassResult.generate", activeEntity: "ReclassResult", domain: d(routeCommand("buildBuildReclassResultsCommand"), routeCommand("executeBuildReclassResultsCommand")), shape: "change_set", target: "mixed", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.ledger.reclassResult.adjust", activeEntity: "ReclassResult", domain: d(routeCommand("buildReclassResultPatchCommand"), routeCommand("executeReclassResultPatchCommand")), commitMode: "native_transition" }),

  registeredWrite({ key: "finance.statementConfig.line.update", activeEntity: "FinanceStatementLineConfig", domain: d(routeCommand("buildSaveStatementConfigCommand"), routeCommand("executeSaveStatementConfigCommand")), shape: "change_set", commitMode: "native_transition" }),
  registeredWrite({ key: "finance.statementConfig.mapping.create", activeEntity: "FinanceStatementAccountMapping", domain: d(financeValidation("buildStatementMappingCommand"), routeCommand("executeSaveStatementMappingCommand")), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "finance.statementConfig.mapping.update", activeEntity: "FinanceStatementAccountMapping", domain: d(financeValidation("buildStatementMappingCommand"), routeCommand("executeSaveStatementMappingCommand")) }),
  registeredLifecycle({ key: "finance.statementConfig.mapping.delete", activeEntity: "FinanceStatementAccountMapping", operation: "delete", domain: d(financeValidation("buildStatementMappingDeleteCommand"), routeCommand("executeDeleteStatementMappingCommand")), referencePolicy: "none" }),

  registeredImport({ key: "finance.budget.import", activeEntity: "FinanceBudget", transport: "file", domain: d(financeValidation("buildBudgetImportCommand"), "packages/finance/server/budget/service.importBudgetWorkbook") }),
  registeredWrite({ key: "finance.budget.version.create", activeEntity: "BudgetVersion", domain: d(financeValidation("buildBudgetVersionCreateCommand"), "packages/finance/server/budget/budget-version.createBudgetVersion"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredLifecycle({ key: "finance.budget.version.activate", activeEntity: "BudgetVersion", operation: "activate", domain: d(financeValidation("buildFinanceIdCommand"), "packages/finance/server/budget/budget-version.activateBudgetVersion"), auditPolicy: "event" }),
  registeredLifecycle({ key: "finance.cost.import.delete", activeEntity: "FinanceCostImport", operation: "delete", domain: d(routeCommand("buildFinanceRouteIdCommand"), routeCommand("executeDeleteCostImportCommand")), referencePolicy: "domain" }),
  registeredImport({ key: "finance.import.confirm", activeEntity: "FinanceImport", transport: "json", result: "batch", domain: d("packages/finance/server/import/route-commands.buildFinanceImportConfirmCommand", "packages/finance/server/import/route-commands.executeFinanceImportConfirmCommand") }),

]);
