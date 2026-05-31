import { prisma } from "@/lib/prisma";

interface VoucherItemInput {
  accountId: unknown;
  debit: unknown;
  credit: unknown;
  description?: unknown;
}

export async function createVoucher(body: Record<string, unknown>, editorId: number) {
  const voucherNo = body.voucherNo as string;
  const date = body.date as string;
  const description = body.description as string | undefined;
  const companyCode = body.companyCode as string | undefined;
  const items = body.items as VoucherItemInput[] | undefined;
  const status = body.status as string | undefined;

  if (!voucherNo || !date || !items?.length) {
    return { error: "凭证号、日期、分录为必填", status: 400 };
  }
  if (!companyCode) {
    return { error: "公司编码为必填", status: 400 };
  }

  const totalDebit = items.reduce(
    (s: number, i) => s + (parseFloat(String(i.debit)) || 0),
    0,
  );
  const totalCredit = items.reduce(
    (s: number, i) => s + (parseFloat(String(i.credit)) || 0),
    0,
  );
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return { error: "借贷不平衡", status: 400 };
  }

  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const period = await prisma.financePeriod.findFirst({
    where: { year, month, companyCode },
  });
  if (!period) {
    return {
      error: `未找到 ${year}年${month}月 的会计期间，请先创建期间`,
      periodNeeded: { year, month },
      status: 400,
    };
  }

  const existing = await prisma.financeVoucher.findFirst({
    where: { voucherNo, companyCode, periodId: period.id },
  });
  if (existing) {
    return { error: "凭证号已存在", status: 400 };
  }

  const voucher = await prisma.financeVoucher.create({
    data: {
      voucherNo,
      date,
      periodId: period.id,
      description: description || "",
      totalDebit,
      totalCredit,
      status: status || "draft",
      companyCode,
      editedBy: editorId,
      items: {
        create: items.map((item, idx) => ({
          accountId: parseInt(String(item.accountId)),
          debit: parseFloat(String(item.debit)) || 0,
          credit: parseFloat(String(item.credit)) || 0,
          description: String(item.description || ""),
          sortOrder: idx,
        })),
      },
    },
    include: { items: { include: { account: true } }, period: true },
  });

  return { success: true, voucher };
}
