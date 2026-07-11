"use client";

import { createActionsSection, createPageDataSection, type DataSurfaceColumnSpec } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { PreviewAccount, PreviewBalance, PreviewResult, PreviewVoucherItem } from "./types";
interface ImportPreviewProps {
  preview: PreviewResult;
  importing: boolean;
  typeLabel: string;
  canImport: boolean;
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
function createAccountColumns(): DataSurfaceColumnSpec<AccountRow>[] {
  return [{
    key: "code",
    label: "编码",
    required: true,
    font: "mono",
    cell: row => row.code
  }, {
    key: "name",
    label: "名称",
    required: true,
    cell: row => row.name
  }, {
    key: "parentCode",
    label: "父级",
    required: true,
    tone: "muted",
    cell: row => row.parentCode || "—"
  }, {
    key: "category",
    label: "类别",
    required: true,
    tone: "muted",
    cell: row => row.category
  }, {
    key: "balanceDirection",
    label: "余额方向",
    required: true,
    tone: "muted",
    cell: row => row.balanceDirection
  }];
}

function createBalanceColumns(): DataSurfaceColumnSpec<BalanceRow>[] {
  return [{
    key: "account",
    label: "科目",
    required: true,
    cell: row => ({
      kind: "group",
      items: [
        { kind: "text", value: row.accountCode, font: "mono" },
        { kind: "text", value: row.accountName },
      ],
    }),
  }, {
    key: "openingDebit",
    label: "期初借",
    required: true,
    align: "right",

    cell: row => row.openingDebit.toFixed(2)
  }, {
    key: "openingCredit",
    label: "期初贷",
    required: true,
    align: "right",

    cell: row => row.openingCredit.toFixed(2)
  }, {
    key: "currentDebit",
    label: "本期借",
    required: true,
    align: "right",

    cell: row => row.currentDebit.toFixed(2)
  }, {
    key: "currentCredit",
    label: "本期贷",
    required: true,
    align: "right",

    cell: row => row.currentCredit.toFixed(2)
  }, {
    key: "closingDebit",
    label: "期末借",
    required: true,
    align: "right",

    cell: row => row.closingDebit.toFixed(2)
  }, {
    key: "closingCredit",
    label: "期末贷",
    required: true,
    align: "right",

    cell: row => row.closingCredit.toFixed(2)
  }];
}

function createVoucherColumns(): DataSurfaceColumnSpec<VoucherItemRow>[] {
  return [{
    key: "account",
    label: "科目",
    required: true,

    cell: row => `${row.accountCode} ${row.accountName}`
  }, {
    key: "description",
    label: "摘要",
    required: true,
    tone: "muted",
    cell: row => row.description
  }, {
    key: "debit",
    label: "借方",
    required: true,
    align: "right",

    cell: row => row.debit > 0 ? row.debit.toFixed(2) : ""
  }, {
    key: "credit",
    label: "贷方",
    required: true,
    align: "right",

    cell: row => row.credit > 0 ? row.credit.toFixed(2) : ""
  }];
}
export function createImportPreviewSections({
  preview,
  importing,
  typeLabel,
  canImport,
  onConfirm
}: ImportPreviewProps): BodySurfaceSectionSpec[] {
  const accountRows = preview.accounts.map(account => ({
    ...account,
    id: account.code
  }));
  const balanceRows = (preview.balances ?? []).slice(0, 20).map(balance => ({
    ...balance,
    id: balance.accountCode
  }));
  const accountColumns = createAccountColumns();
  const balanceColumns = createBalanceColumns();
  const sections: BodySurfaceSectionSpec[] = [
    ...(preview.errors.length === 0 && canImport
      ? [createActionsSection("import-preview-actions", [{
          key: "confirm",
          label: importing ? "导入中..." : "确认导入",
          icon: "upload",
          variant: "primary",
          onClick: onConfirm,
          disabled: importing,
        }])]
      : []),
    {
      key: "import-preview-heading",
      header: {
        title: `预览：${typeLabel}（${preview.year}年）`,
      },
      body: { kind: "section" },
    },
    ...createNoticeSections("错误", preview.errors, "danger"),
    ...createNoticeSections("警告", preview.warnings, "warning"),
    {
      ...createPageDataSection("preview-accounts", {
        kind: "table",
        rows: accountRows,
        columns: accountColumns,
        visibleColumns: accountColumns.map(column => column.key),
        rowKey: row => row.id,
        presentation: { density: "compact" },
        emptyText: "暂无数据",
        scroll: { maxHeight: "sm" },
      }),
      header: { title: "科目列表" },
    },
    ...(balanceRows.length > 0
      ? [{
          ...createPageDataSection("preview-balances", {
            kind: "table" as const,
            rows: balanceRows,
            columns: balanceColumns,
            visibleColumns: balanceColumns.map(column => column.key),
            rowKey: row => row.id,
            presentation: { density: "compact" as const },
            emptyText: "暂无数据",
            scroll: { maxHeight: "sm" as const },
          }),
          header: { title: "余额预览（前20条）" },
        }]
      : []),
    ...(preview.balances && preview.balances.length > 20
      ? [{
          key: "preview-balance-more",
          body: { kind: "section" as const, message: { tone: "muted" as const, content: `还有 ${preview.balances.length - 20} 条未显示` } },
        }]
      : []),
    ...createVoucherPreviewSections(preview),
  ];
  return sections;
}

function createNoticeSections(title: string, items: string[], tone: "danger" | "warning"): BodySurfaceSectionSpec[] {
  if (items.length === 0) return [];
  return [{
    key: `preview-${title}`,
    body: {
      kind: "section",
      message: {
        tone,
        content: `${title}（${items.length}）：${items.join("；")}`,
      },
    },
  }];
}

function createVoucherPreviewSections(preview: PreviewResult): BodySurfaceSectionSpec[] {
  if (!preview.vouchers?.length) return [];
  const voucherColumns = createVoucherColumns();
  return [
    ...preview.vouchers.slice(0, 10).map((voucher) => {
      const rows = voucher.items.map((item, index) => ({
        ...item,
        id: `${voucher.voucherNo}-${index}`
      }));
      return {
        ...createPageDataSection(`voucher-preview-${voucher.voucherNo}`, {
          kind: "table" as const,
          rows,
          columns: voucherColumns,
          visibleColumns: voucherColumns.map(column => column.key),
          rowKey: row => row.id,
          presentation: { density: "compact" as const },
          emptyText: "暂无分录",
        }),
        header: { title: `凭证 ${voucher.voucherNo}` },
      };
    }),
    ...(preview.vouchers.length > 10
      ? [{
          key: "preview-voucher-more",
          body: { kind: "section" as const, message: { tone: "muted" as const, content: `还有 ${preview.vouchers.length - 10} 张未显示` } },
        }]
      : []),
  ];
}
