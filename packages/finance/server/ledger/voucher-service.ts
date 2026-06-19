import { matchText } from "@workspace/core/search";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

interface VoucherItemInput {
  accountId: unknown;
  debit: unknown;
  credit: unknown;
  description?: unknown;
}

export interface ListVouchersInput {
  periodId?: number;
  status?: string;
  companyCode?: string;
  year?: number;
  month?: number;
  keyword?: string;
  page: number;
  pageSize: number;
}

function calculateVoucherTotals(items: VoucherItemInput[]) {
  return {
    totalDebit: items.reduce((s: number, i) => s + (parseFloat(String(i.debit)) || 0), 0),
    totalCredit: items.reduce((s: number, i) => s + (parseFloat(String(i.credit)) || 0), 0),
  };
}

function toVoucherItemCreateInput(items: VoucherItemInput[]) {
  return items.map((item, idx) => ({
    accountId: parseInt(String(item.accountId)),
    debit: parseFloat(String(item.debit)) || 0,
    credit: parseFloat(String(item.credit)) || 0,
    description: String(item.description || ""),
    sortOrder: idx,
  }));
}

function validateBalancedVoucher(items: VoucherItemInput[]) {
  const totals = calculateVoucherTotals(items);
  if (Math.abs(totals.totalDebit - totals.totalCredit) > 0.001) {
    return { error: "借贷不平衡", status: 400 };
  }
  return totals;
}

export async function listVouchers(input: ListVouchersInput) {
  const where: Prisma.FinanceVoucherWhereInput = {};
  if (input.periodId) where.periodId = input.periodId;
  if (input.status) where.status = input.status;
  if (input.companyCode) where.companyCode = input.companyCode;
  if (input.year !== undefined || input.month !== undefined) {
    where.period = {};
    if (input.year !== undefined) where.period.year = input.year;
    if (input.month !== undefined) where.period.month = input.month;
  }

  const skip = (input.page - 1) * input.pageSize;
  const include = {
    items: { include: { account: true }, orderBy: { sortOrder: "asc" as const } },
    period: true,
  };

  if (input.keyword) {
    const all = await prisma.financeVoucher.findMany({
      where,
      orderBy: { date: "desc" },
      include,
    });
    const filtered = all.filter(
      (voucher) =>
        matchText(voucher.voucherNo, input.keyword || "") ||
        matchText(voucher.description || "", input.keyword || ""),
    );
    const vouchers = filtered.slice(skip, skip + input.pageSize);
    const total = filtered.length;
    return {
      data: vouchers,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
      vouchers,
    };
  }

  const [vouchers, total] = await Promise.all([
    prisma.financeVoucher.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: input.pageSize,
      include,
    }),
    prisma.financeVoucher.count({ where }),
  ]);

  return {
    data: vouchers,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
    vouchers,
  };
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

  const totals = validateBalancedVoucher(items);
  if ("error" in totals) {
    return totals;
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
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      status: status || "draft",
      companyCode,
      editedBy: editorId,
      items: {
        create: toVoucherItemCreateInput(items),
      },
    },
    include: { items: { include: { account: true } }, period: true },
  });

  return { success: true, voucher };
}

export async function updateVoucher(
  voucherId: number,
  body: Record<string, unknown>,
  editorId: number,
) {
  const date = body.date as string | undefined;
  const description = body.description as string | undefined;
  const status = body.status as string | undefined;
  const items = body.items as VoucherItemInput[] | undefined;

  const voucher = await prisma.financeVoucher.findUnique({
    where: { id: voucherId },
    include: { items: true },
  });
  if (!voucher) {
    return { error: "凭证不存在", status: 404 };
  }
  if (voucher.status === "posted" && !status) {
    return { error: "已过账凭证不能直接修改，请先反过账", status: 400 };
  }

  const updateData: Record<string, unknown> = {
    editedBy: editorId,
    editedAt: new Date(),
    version: { increment: 1 },
  };
  if (date && date !== voucher.date) {
    updateData.date = date;
    const dateObj = new Date(date);
    const period = await prisma.financePeriod.findFirst({
      where: {
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
        companyCode: voucher.companyCode,
      },
    });
    if (period) updateData.periodId = period.id;
  }
  if (description !== undefined) updateData.description = description;
  if (status) updateData.status = status;

  if (items && items.length > 0) {
    const totals = validateBalancedVoucher(items);
    if ("error" in totals) {
      return totals;
    }
    updateData.totalDebit = totals.totalDebit;
    updateData.totalCredit = totals.totalCredit;

    await prisma.financeVoucherItem.deleteMany({ where: { voucherId } });
    updateData.items = { create: toVoucherItemCreateInput(items) };
  }

  const updated = await prisma.financeVoucher.update({
    where: { id: voucherId },
    data: updateData as unknown as Prisma.FinanceVoucherUpdateInput,
    include: { items: { include: { account: true } }, period: true },
  });

  return { success: true, voucher: updated };
}

export async function deleteVoucher(voucherId: number) {
  await prisma.financeVoucher.delete({ where: { id: voucherId } });
  return { success: true };
}
