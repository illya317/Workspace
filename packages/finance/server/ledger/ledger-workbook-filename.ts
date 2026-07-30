import type {
  FinanceLedgerExportMode,
  FinanceLedgerExportView,
  FinanceVoucherPeriodScope,
} from "../../types/ledger";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import { counterpartyPeriodLabel } from "./counterparty-period";

interface LedgerWorkbookFilenameInput {
  view: FinanceLedgerExportView;
  companyCode?: string;
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  voucherKind?: "standard" | "group";
  voucherPeriodScope?: FinanceVoucherPeriodScope;
  exportMode?: FinanceLedgerExportMode;
}

export function ledgerWorkbookFilename(command: LedgerWorkbookFilenameInput, sheetName: string) {
  const company = command.companyCode || "全部公司";
  const period = command.year === undefined
    ? "全部期间"
    : command.month === undefined
      ? String(command.year)
      : command.view === "counterparty" || command.view === "vouchers"
        ? counterpartyPeriodLabel(command.year, command.month, command.periodKind ?? "month")
        : `${command.year}.${String(command.month).padStart(2, "0")}`;
  const exportName = command.view === "vouchers" && command.voucherKind === "group"
    ? `合并明细-${command.voucherPeriodScope === "history" ? "历史汇总" : "当期"}-${command.exportMode === "detail" ? "明细" : "汇总"}`
    : sheetName;
  return `${company}-${period}-${exportName}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
}
