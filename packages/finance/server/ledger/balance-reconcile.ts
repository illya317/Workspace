import { prisma } from "@workspace/platform/server/prisma";
import { parseBalanceSheet } from "../import/import";
import { computeAnnualComparisonBase } from "./balances";
import * as xlsx from "xlsx";

export interface ReconcileDiff {
  accountCode: string;
  accountName: string;
  field: string;
  excelValue: number;
  systemValue: number;
  diff: number;
}

export interface ReconcileResult {
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

function extractMonthRange(periodStr: string): [number, number] {
  const range = periodStr.match(/(\d{4})\.(\d{2})\s*-?\s*(\d{4})?\.(\d{2})/);
  if (range) return [parseInt(range[2], 10), parseInt(range[4], 10)];

  const single = periodStr.match(/(\d{4})\.(\d{2})/);
  if (single) return [parseInt(single[2], 10), parseInt(single[2], 10)];

  return [1, 12];
}

function detectMonthRange(buffer: Buffer, fileExt: string): [number, number] {
  const wb = xlsx.read(buffer, { type: "buffer", codepage: fileExt === ".xls" ? 936 : undefined });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    for (const cell of rawData[i] || []) {
      const text = String(cell || "").trim();
      if (text.includes("月份") || text.includes("期间")) {
        return extractMonthRange(text);
      }
    }
  }
  return [1, 12];
}

export async function reconcileBalanceSheet(buffer: Buffer, companyCode: string, fileExt: string): Promise<ReconcileResult> {
  const preview = parseBalanceSheet(buffer, companyCode, fileExt);
  if (preview.errors.length > 0) throw new Error(preview.errors[0]);

  const excelBalances = preview.balances || [];
  if (excelBalances.length === 0) throw new Error("未能从文件中解析出余额数据");
  if (preview.year === 0) throw new Error("未能从文件中识别会计年度");

  const year = preview.year;
  const [monthStart, monthEnd] = detectMonthRange(buffer, fileExt);
  const systemAccounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    orderBy: { code: "asc" },
  });

  const systemAccountMap = new Map(systemAccounts.map((a) => [a.code, a]));
  const computedMap = await computeAnnualComparisonBase(companyCode, year, monthStart, monthEnd);
  const differences: ReconcileDiff[] = [];
  const missingInSystem: { code: string; name: string }[] = [];
  let matchedCount = 0;

  for (const excelBal of excelBalances) {
    const sysAcc = systemAccountMap.get(excelBal.accountCode);
    if (!sysAcc) {
      missingInSystem.push({ code: excelBal.accountCode, name: excelBal.accountName });
      continue;
    }

    const computed = computedMap.get(sysAcc.code);
    if (!computed) continue;

    const fields = [
      { label: "期初借方", excel: excelBal.openingDebit, system: computed.openingDebit },
      { label: "期初贷方", excel: excelBal.openingCredit, system: computed.openingCredit },
      { label: "本期发生借方", excel: excelBal.currentDebit, system: computed.currentDebit },
      { label: "本期发生贷方", excel: excelBal.currentCredit, system: computed.currentCredit },
      { label: "期末借方", excel: excelBal.closingDebit, system: computed.closingDebit },
      { label: "期末贷方", excel: excelBal.closingCredit, system: computed.closingCredit },
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
    if (!hasDiff) matchedCount++;
  }

  // 系统中有但 Excel 中缺失的科目不参与核对：系统可能包含多年度/多公司的科目，
  // Excel 只代表单次导入的年度余额表，科目范围不同是正常的，不属于差异。
  const missingInExcel: { code: string; name: string }[] = [];

  return {
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
}
