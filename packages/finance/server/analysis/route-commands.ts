import { getBudgetAnalysis } from "./budget-analysis";
import { getFundFlowAnalysis } from "./fund-flow-analysis";
import { getManagementAnalysis } from "./management-analysis";

export function executeBudgetAnalysisCommand(command: { year: number; companyCode?: string }) {
  return getBudgetAnalysis(command.year, command.companyCode);
}

export function executeFundFlowAnalysisCommand(command: {
  companyCodes: string[];
  year: number;
  month?: number;
}) {
  return getFundFlowAnalysis(command);
}

export function executeManagementAnalysisCommand(command: {
  companyCodes: string[];
  year: number;
  month?: number;
}) {
  return getManagementAnalysis(command);
}
