import { NextResponse } from "next/server";
import { withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import type { PreviewResult, PreviewAccount } from "@/server/services/finance/import";

export const POST = withFinanceWrite(async (request: Request) => {
  try {
    const body = await request.json();
    const { preview }: { preview: PreviewResult } = body;

    if (!preview || preview.errors.length > 0) {
      return NextResponse.json({ error: "预览数据有误，无法导入" }, { status: 400 });
    }

    const { type, companyCode, year, accounts } = preview;

    // 1. 创建/更新科目
    const accountCodeToId = new Map<string, number>();
    const codeToAccount = new Map<string, PreviewAccount>();
    for (const acc of accounts) {
      codeToAccount.set(acc.code, acc);
    }

    // 按编码长度排序，确保父级先创建
    const sortedAccounts = [...accounts].sort((a, b) => a.code.length - b.code.length);

    for (const acc of sortedAccounts) {
      let parentId: number | null = null;
      if (acc.parentCode) {
        parentId = accountCodeToId.get(acc.parentCode) ?? null;
      }

      const existing = await prisma.financeAccount.findUnique({
        where: { code: acc.code },
      });

      if (existing) {
        await prisma.financeAccount.update({
          where: { id: existing.id },
          data: {
            name: acc.name,
            category: acc.category,
            balanceDirection: acc.balanceDirection,
            parentId,
            companyCode,
          },
        });
        accountCodeToId.set(acc.code, existing.id);
      } else {
        const created = await prisma.financeAccount.create({
          data: {
            code: acc.code,
            name: acc.name,
            category: acc.category,
            balanceDirection: acc.balanceDirection,
            parentId,
            companyCode,
            sortOrder: 0,
          },
        });
        accountCodeToId.set(acc.code, created.id);
      }
    }

    // 2. 创建期间（年度，存为 month=12）
    let period = await prisma.financePeriod.findFirst({
      where: { year, month: 12, companyCode },
    });
    if (!period) {
      period = await prisma.financePeriod.create({
        data: {
          year,
          month: 12,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
          companyCode,
        },
      });
    }

    let imported = 0;

    if (type === "balance" && preview.balances) {
      // 3a. 导入余额表
      for (const bal of preview.balances) {
        const accountId = accountCodeToId.get(bal.accountCode);
        if (!accountId) continue;

        await prisma.financeAccountBalance.upsert({
          where: {
            accountId_periodId: { accountId, periodId: period.id },
          },
          create: {
            accountId,
            periodId: period.id,
            openingDebit: bal.openingDebit,
            openingCredit: bal.openingCredit,
            currentDebit: bal.currentDebit,
            currentCredit: bal.currentCredit,
            closingDebit: bal.closingDebit,
            closingCredit: bal.closingCredit,
            companyCode,
          },
          update: {
            openingDebit: bal.openingDebit,
            openingCredit: bal.openingCredit,
            currentDebit: bal.currentDebit,
            currentCredit: bal.currentCredit,
            closingDebit: bal.closingDebit,
            closingCredit: bal.closingCredit,
            companyCode,
          },
        });
        imported++;
      }
    }

    if (type === "journal" && preview.vouchers) {
      // 3b. 导入序时账
      for (const v of preview.vouchers) {
        // 解析日期
        let dateStr = v.date;
        if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) {
          dateStr = dateStr.replace(/\./g, "-");
        }

        // 检查凭证是否已存在
        const existing = await prisma.financeVoucher.findUnique({
          where: { voucherNo: v.voucherNo },
        });
        if (existing) {
          // 删除旧明细，更新凭证
          await prisma.financeVoucherItem.deleteMany({
            where: { voucherId: existing.id },
          });
          await prisma.financeVoucher.update({
            where: { id: existing.id },
            data: {
              date: dateStr,
              description: v.description,
              totalDebit: v.totalDebit,
              totalCredit: v.totalCredit,
              companyCode,
            },
          });

          for (const item of v.items) {
            const accountId = accountCodeToId.get(item.accountCode);
            if (!accountId) continue;
            await prisma.financeVoucherItem.create({
              data: {
                voucherId: existing.id,
                accountId,
                debit: item.debit,
                credit: item.credit,
                description: item.description,
              },
            });
          }
          imported++;
        } else {
          const voucher = await prisma.financeVoucher.create({
            data: {
              voucherNo: v.voucherNo,
              date: dateStr,
              periodId: period.id,
              description: v.description,
              totalDebit: v.totalDebit,
              totalCredit: v.totalCredit,
              companyCode,
              status: "posted",
            },
          });

          for (const item of v.items) {
            const accountId = accountCodeToId.get(item.accountCode);
            if (!accountId) continue;
            await prisma.financeVoucherItem.create({
              data: {
                voucherId: voucher.id,
                accountId,
                debit: item.debit,
                credit: item.credit,
                description: item.description,
              },
            });
          }
          imported++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      year,
      companyCode,
      type,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
