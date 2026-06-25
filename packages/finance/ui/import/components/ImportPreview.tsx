"use client";

import { CommandButton, DataTable, PanelCard, SectionCard, type DataTableColumn } from "@workspace/core/ui";
import type { PreviewAccount, PreviewBalance, PreviewResult, PreviewVoucher, PreviewVoucherItem } from "./types";
interface ImportPreviewProps {
  preview: PreviewResult;
  importing: boolean;
  typeLabel: string;
  onConfirm: () => void;
}
type AccountRow = PreviewAccount & {
  id: string;
};
type BalanceRow = PreviewBalance & {
  id: string;
};
type VoucherItemRow = PreviewVoucherItem & {
  id: string;
};
const accountColumns: DataTableColumn<AccountRow>[] = [{
  key: "code",
  label: "编码",
  required: true,
  className: "font-mono",
  render: row => row.code
}, {
  key: "name",
  label: "名称",
  required: true,
  render: row => row.name
}, {
  key: "parentCode",
  label: "父级",
  required: true,
  className: "text-slate-500",
  render: row => row.parentCode || "—"
}, {
  key: "category",
  label: "类别",
  required: true,
  className: "text-slate-500",
  render: row => row.category
}, {
  key: "balanceDirection",
  label: "余额方向",
  required: true,
  className: "text-slate-500",
  render: row => row.balanceDirection
}];
const balanceColumns: DataTableColumn<BalanceRow>[] = [{
  key: "account",
  label: "科目",
  required: true,
  render: row => <><span className="font-mono">{row.accountCode}</span> {row.accountName}</>
}, {
  key: "openingDebit",
  label: "期初借",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.openingDebit.toFixed(2)
}, {
  key: "openingCredit",
  label: "期初贷",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.openingCredit.toFixed(2)
}, {
  key: "currentDebit",
  label: "本期借",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.currentDebit.toFixed(2)
}, {
  key: "currentCredit",
  label: "本期贷",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.currentCredit.toFixed(2)
}, {
  key: "closingDebit",
  label: "期末借",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.closingDebit.toFixed(2)
}, {
  key: "closingCredit",
  label: "期末贷",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.closingCredit.toFixed(2)
}];
const voucherColumns: DataTableColumn<VoucherItemRow>[] = [{
  key: "account",
  label: "科目",
  required: true,
  className: "text-slate-600",
  render: row => `${row.accountCode} ${row.accountName}`
}, {
  key: "description",
  label: "摘要",
  required: true,
  className: "text-slate-500",
  render: row => row.description
}, {
  key: "debit",
  label: "借方",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.debit > 0 ? row.debit.toFixed(2) : ""
}, {
  key: "credit",
  label: "贷方",
  required: true,
  className: "text-right text-slate-600",
  headerClassName: "text-right",
  render: row => row.credit > 0 ? row.credit.toFixed(2) : ""
}];
function NoticeList({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "red" | "yellow";
}) {
  if (items.length === 0) return null;
  const toneClassName = tone === "red" ? "text-red-700" : "text-yellow-700";
  return <div className={`mb-4 text-sm ${toneClassName}`}>
      <p className="font-medium">{title}（{items.length}）：</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
      </ul>
    </div>;
}
function PreviewDataTable<T>({
  title,
  rows,
  columns,
  rowKey
}: {
  title: string;
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
}) {
  return <div className="mb-4">
      <div className="mb-2 text-sm font-semibold text-gray-700">{title}</div>
      <div className="max-h-64 overflow-auto">
        <DataTable rows={rows} columns={columns} visibleColumns={columns.map(column => column.key)} rowKey={rowKey} density="compact" emptyText="暂无数据" />
      </div>
    </div>;
}
function VoucherPreview({
  voucher
}: {
  voucher: PreviewVoucher;
}) {
  const rows = voucher.items.map((item, index) => ({
    ...item,
    id: `${voucher.voucherNo}-${index}`
  }));
  return <PanelCard title={voucher.voucherNo} subtitle={`${voucher.date}｜借 ${voucher.totalDebit.toFixed(2)} / 贷 ${voucher.totalCredit.toFixed(2)}`} bodyClassName="p-0">
      <DataTable rows={rows} columns={voucherColumns} visibleColumns={voucherColumns.map(column => column.key)} rowKey={row => row.id} density="compact" emptyText="暂无分录" />
    </PanelCard>;
}
export default function ImportPreview({
  preview,
  importing,
  typeLabel,
  onConfirm
}: ImportPreviewProps) {
  const accountRows = preview.accounts.map(account => ({
    ...account,
    id: account.code
  }));
  const balanceRows = (preview.balances ?? []).slice(0, 20).map(balance => ({
    ...balance,
    id: balance.accountCode
  }));
  const actions = preview.errors.length === 0 ? <CommandButton variant="primary" onClick={onConfirm} disabled={importing}>
      {importing ? "导入中..." : "确认导入"}
    </CommandButton> : null;
  return <SectionCard title={`预览：${typeLabel}（${preview.year}年）`} subtitle={`共 ${preview.rows} 行原始数据，解析出 ${preview.accounts.length} 个科目${preview.balances ? `，${preview.balances.length} 条余额` : ""}${preview.vouchers ? `，${preview.vouchers.length} 张凭证` : ""}`} actions={actions}>
      <NoticeList title="错误" items={preview.errors} tone="red" />
      <NoticeList title="警告" items={preview.warnings} tone="yellow" />

      <PreviewDataTable title="科目列表" rows={accountRows} columns={accountColumns} rowKey={row => row.id} />

      {balanceRows.length > 0 && <PreviewDataTable title="余额预览（前20条）" rows={balanceRows} columns={balanceColumns} rowKey={row => row.id} />}
      {preview.balances && preview.balances.length > 20 && <p className="mb-4 text-xs text-gray-400">还有 {preview.balances.length - 20} 条未显示</p>}

      {preview.vouchers && preview.vouchers.length > 0 && <div className="mb-4">
          <div className="mb-2 text-sm font-semibold text-gray-700">凭证预览（前10张）</div>
          <div className="max-h-96 space-y-3 overflow-auto">
            {preview.vouchers.slice(0, 10).map(voucher => <VoucherPreview key={voucher.voucherNo} voucher={voucher} />)}
          </div>
        </div>}
      {preview.vouchers && preview.vouchers.length > 10 && <p className="text-xs text-gray-400">还有 {preview.vouchers.length - 10} 张未显示</p>}
    </SectionCard>;
}
