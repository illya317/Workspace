import { NextResponse } from "next/server";
import { withFinanceWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { parseBalanceSheet } from "@/server/services/finance/import";
import * as xlsx from "xlsx";

interface ReconcileDiff {
  accountCode: string;
  accountName: string;
  field: string;
  excelValue: number;
  systemValue: number;
  diff: number;
}

interface ReconcileResult {
  year: number;
  monthStart: number;
  monthEnd: number;
  companyCode: string;
  excelRowCount: number;
  systemAccountCount: number;
  matchedCount: number;
  differences: ReconcileDiff[];
  missingInSystem: { code: string; name: string }[];
  missingInExcel: { code: string; name: string }[];
}

/** 从Excel余额表提取月份范围，如 "月份：2024.01-2024.12" → [1,12] */
function extractMonthRange(periodStr: string): [number, number] {
  const m = periodStr.match(/(\d{4})\.(\d{2})-(\d{4})\.(\d{2})/);
  if (m) {
    return [parseInt(m[2], 10), parseInt(m[4], 10)];
  }
  const single = periodStr.match(/(\d{4})\.(\d{2})/);
  if (single) {
    const month = parseInt(single[2], 10);
    return [month, month];
  }
  return [1, 12];
}

/** 计算期末余额 = 期初 + 本期发生（按余额方向） */
function calcClosing(
  balanceDirection: string,
  openingDebit: number,
  openingCredit: number,
  currentDebit: number,
  currentCredit: number,
): { closingDebit: number; closingCredit: number } {
  let closingDebit = 0;
  let closingCredit = 0;
  if (balanceDirection === "debit") {
    const net = openingDebit - openingCredit + currentDebit - currentCredit;
    if (net >= 0) closingDebit = net;
    else closingCredit = -net;
  } else {
    const net = openingCredit - openingDebit + currentCredit - currentDebit;
    if (net >= 0) closingCredit = net;
    else closingDebit = -net;
  }
  return { closingDebit, closingCredit };
}

/** POST 上传Excel余额表，与系统凭证计算结果核对 */
export const POST = withFinanceWrite(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyCode = formData.get("companyCode") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传余额表文件" }, { status: 400 });
    }
    if (!companyCode) {
      return NextResponse.json({ error: "请选择公司" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

    // 1. 解析Excel余额表
    const preview = parseBalanceSheet(buffer, companyCode, fileExt);
    if (preview.errors.length > 0) {
      return NextResponse.json({ error: preview.errors[0] }, { status: 400 });
    }

    const excelBalances = preview.balances || [];
    if (excelBalances.length === 0) {
      return NextResponse.json({ error: "未能从文件中解析出余额数据" }, { status: 400 });
    }

    const year = preview.year;
    if (year === 0) {
      return NextResponse.json({ error: "未能从文件中识别会计年度" }, { status: 400 });
    }

    // 2. 提取月份范围（从Excel数据推断）
    let monthStart = 1;
    let monthEnd = 12;
    const wb = xlsx.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    for (let i = 1; i < Math.min(rawData.length, 10); i++) {
      const row = rawData[i];
      if (row && row.length > 1) {
        const periodStr = String(row[1] || "").trim();
        if (periodStr.includes("月份")) {
          const [s, e] = extractMonthRange(periodStr);
          monthStart = s;
          monthEnd = e;
          break;
        }
      }
    }

    // 3. 获取系统中该年该公司的科目
    const systemAccounts = await prisma.financeAccount.findMany({
      where: { companyCode, year },
      orderBy: { code: "asc" },
    });

    const systemAccountMap = new Map(systemAccounts.map((a) => [a.code, a]));

    // 4. 从凭证计算系统本期发生额
    const periods = await prisma.financePeriod.findMany({
      where: {
        year,
        month: { gte: monthStart, lte: monthEnd },
        companyCode,
      },
    });

    const periodIds = periods.map((p) => p.id);
    const systemCurrentMap = new Map<
      number,
      { debit: number; credit: number }
    >();

    if (periodIds.length > 0) {
      const voucherItems = await prisma.financeVoucherItem.findMany({
        where: {
          voucher: {
            periodId: { in: periodIds },
            status: "posted",
          },
        },
        include: { account: true },
      });

      for (const item of voucherItems) {
        const acc = systemCurrentMap.get(item.accountId) || {
          debit: 0,
          credit: 0,
        };
        acc.debit += item.debit;
        acc.credit += item.credit;
        systemCurrentMap.set(item.accountId, acc);
      }
    }

    // 5. 逐科目比对
    const differences: ReconcileDiff[] = [];
    const missingInSystem: { code: string; name: string }[] = [];
    let matchedCount = 0;

    for (const excelBal of excelBalances) {
      const sysAcc = systemAccountMap.get(excelBal.accountCode);
      if (!sysAcc) {
        missingInSystem.push({
          code: excelBal.accountCode,
          name: excelBal.accountName,
        });
        continue;
      }

      const sysCurrent = systemCurrentMap.get(sysAcc.id) || {
        debit: 0,
        credit: 0,
      };

      // 以Excel期初为基准，用系统本期发生计算期末
      const sysClosing = calcClosing(
        sysAcc.balanceDirection,
        excelBal.openingDebit,
        excelBal.openingCredit,
        sysCurrent.debit,
        sysCurrent.credit,
      );

      const fields = [
        { label: "本期发生借方", excel: excelBal.currentDebit, system: sysCurrent.debit },
        { label: "本期发生贷方", excel: excelBal.currentCredit, system: sysCurrent.credit },
        { label: "期末借方", excel: excelBal.closingDebit, system: sysClosing.closingDebit },
        { label: "期末贷方", excel: excelBal.closingCredit, system: sysClosing.closingCredit },
      ];

      let hasDiff = false;
      for (const { label, excel, system } of fields) {
        const diff = Math.abs(excel - system);
        if (diff > 0.01) {
          hasDiff = true;
          differences.push({
            accountCode: excelBal.accountCode,
            accountName: excelBal.accountName,
            field: label,
            excelValue: +excel.toFixed(2),
            systemValue: +system.toFixed(2),
            diff: +diff.toFixed(2),
          });
        }
      }

      if (!hasDiff) {
        matchedCount++;
      }
    }

    // 系统中有多余的科目（Excel中没有）
    const excelCodeSet = new Set(excelBalances.map((b) => b.accountCode));
    const missingInExcel: { code: string; name: string }[] = [];
    for (const sysAcc of systemAccounts) {
      if (!excelCodeSet.has(sysAcc.code)) {
        missingInExcel.push({ code: sysAcc.code, name: sysAcc.name });
      }
    }

    const result: ReconcileResult = {
      year,
      monthStart,
      monthEnd,
      companyCode,
      excelRowCount: excelBalances.length,
      systemAccountCount: systemAccounts.length,
      matchedCount,
      differences,
      missingInSystem,
      missingInExcel,
    };

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "核对失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
