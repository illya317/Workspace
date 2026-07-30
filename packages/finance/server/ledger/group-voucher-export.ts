import type {
  FinanceLedgerExportMode,
  GroupVoucherSourceTrace,
  Voucher,
  VoucherItem,
} from "@workspace/finance/types";
import type { LedgerWorkbookInput } from "./ledger-workbook";

type WorkbookRow = Array<string | number>;

export function buildGroupVoucherWorkbook(
  vouchers: readonly Voucher[],
  mode: FinanceLedgerExportMode,
): LedgerWorkbookInput {
  return mode === "detail"
    ? buildGroupVoucherDetailWorkbook(vouchers)
    : buildGroupVoucherSummaryWorkbook(vouchers);
}

function buildGroupVoucherSummaryWorkbook(vouchers: readonly Voucher[]): LedgerWorkbookInput {
  return {
    sheetName: "合并汇总",
    columns: [
      textColumn("凭证号", 20), textColumn("凭证日期", 14), textColumn("发生日期", 14),
      textColumn("合并主体", 28), textColumn("分录序号", 10), textColumn("科目编码", 16),
      textColumn("科目名称", 30), textColumn("公司主体", 18),
      amountColumn("借方", 16), amountColumn("贷方", 16), textColumn("状态", 12),
    ],
    rows: vouchers.flatMap((voucher) => voucher.items.map((item, index) => [
      voucher.voucherNo,
      dateLabel(voucher.date),
      item.sourceDate ?? "",
      voucher.description ?? "",
      index + 1,
      item.account.code,
      item.account.name,
      item.entityName ?? "",
      Number(item.debit),
      Number(item.credit),
      voucher.status,
    ])),
  };
}

function buildGroupVoucherDetailWorkbook(vouchers: readonly Voucher[]): LedgerWorkbookInput {
  return {
    sheetName: "合并审计明细",
    columns: [
      textColumn("合并凭证号", 20), textColumn("合并日期", 14), textColumn("合并摘要", 32),
      textColumn("分录序号", 10), textColumn("合并主体", 18), textColumn("对方主体", 18),
      textColumn("抵销来源", 14), textColumn("原科目编码", 16), textColumn("原科目名称", 30),
      textColumn("报表列示编码", 16), textColumn("报表列示名称", 24),
      amountColumn("合并借方", 16), amountColumn("合并贷方", 16),
      textColumn("重分类路径", 38), textColumn("重分类依据", 18), textColumn("重分类状态", 12),
      textColumn("审计来源", 18), textColumn("来源日期/余额日", 16), textColumn("原始凭证号", 22),
      textColumn("原始科目编码", 16), textColumn("原始科目名称", 30), textColumn("处理", 18),
      textColumn("原始摘要", 40), amountColumn("来源借方", 16), amountColumn("来源贷方", 16),
      amountColumn("期初净额", 16), amountColumn("本期净变动", 16), amountColumn("期末净额", 16),
      amountColumn("期初未穿透", 16), amountColumn("本期未穿透", 16), textColumn("合并状态", 12),
    ],
    rows: vouchers.flatMap((voucher) => voucher.items.flatMap((item, index) => {
      const traces: Array<GroupVoucherSourceTrace | null> = item.sourceTrace?.length
        ? item.sourceTrace
        : [null];
      return traces.map((trace) => groupVoucherDetailRow(voucher, item, index, trace));
    })),
  };
}

function groupVoucherDetailRow(
  voucher: Voucher,
  item: VoucherItem,
  index: number,
  trace: GroupVoucherSourceTrace | null,
): WorkbookRow {
  const presentationAccount = item.presentationAccount ?? item.account;
  const reclassification = item.sourceReclassification;
  const balance = item.sourceBalanceCheck;
  return [
    voucher.voucherNo,
    dateLabel(voucher.date),
    voucher.description ?? "",
    index + 1,
    item.entityName ?? "",
    item.counterpartyName ?? "",
    groupSourceKindLabel(item.sourceKind),
    item.account.code,
    item.account.name,
    presentationAccount.code,
    presentationAccount.name,
    Number(item.debit),
    Number(item.credit),
    reclassification ? `${reclassification.sourceAccountName} ${reclassification.sourceAccountCode} → ${reclassification.targetAccountName} ${reclassification.targetAccountCode}` : "",
    reclassificationBasisLabel(reclassification?.basis),
    reclassificationStatusLabel(reclassification?.status),
    trace?.sourceLabel ?? "无可穿透来源",
    trace?.date ?? "",
    trace?.voucherNo ?? "",
    trace?.accountCode ?? "",
    trace?.accountName ?? "",
    traceProcessingLabel(trace),
    trace?.description ?? "",
    trace ? Number(trace.debit) : "",
    trace ? Number(trace.credit) : "",
    balance ? balance.openingNet : "",
    balance ? balance.currentMovementNet : "",
    balance ? balance.closingNet : "",
    balance ? balance.openingUntracedNet : "",
    balance ? balance.currentUntracedNet : "",
    voucher.status,
  ];
}

function groupSourceKindLabel(value: VoucherItem["sourceKind"]) {
  if (value === "auxiliaryBalance") return "辅助余额";
  if (value === "openItem") return "未清项";
  if (value === "cashFlowAllocation") return "现金流分配";
  if (value === "workpaper") return "工作底稿";
  if (value === "voucher") return "原始凭证";
  return "";
}

function traceProcessingLabel(trace: GroupVoucherSourceTrace | null) {
  if (!trace) return "未提供";
  if (trace.sourceType === "untracedOpeningBalance" || trace.sourceType === "untracedMovement") return "未穿透";
  if (trace.reclassifiedToAccountCode) return `重分类 → ${trace.reclassifiedToAccountCode}`;
  if (trace.voucherNo) return "原始入账";
  return "余额勾稽";
}

function reclassificationBasisLabel(value: string | undefined) {
  if (!value) return "";
  return value === "counterparty_gross" ? "按往来户毛额" : "按科目净额";
}

function reclassificationStatusLabel(value: string | undefined) {
  if (!value) return "";
  if (value === "approved") return "已批准";
  if (value === "adjusted") return "已调整";
  return value;
}

function dateLabel(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function textColumn(header: string, width: number) {
  return { header, width };
}

function amountColumn(header: string, width: number) {
  return { header, width, numeric: true };
}
