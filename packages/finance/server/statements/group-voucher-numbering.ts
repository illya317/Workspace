import type { Prisma } from "@workspace/platform/server/prisma";

const GROUP_VOUCHER_NUMBER = /^(\d{4})-(\d{2})-合-(\d+)$/;

export function groupVoucherNumber(year: number, month: number, sequence: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("集团凭证年度无效");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("集团凭证月份无效");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("集团凭证序号无效");
  }
  return `${year}-${String(month).padStart(2, "0")}-合-${String(sequence).padStart(4, "0")}`;
}

export function nextGroupVoucherSequence(
  entryNumbers: readonly string[],
  year: number,
  month: number,
) {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  return entryNumbers.reduce((maximum, entryNumber) => {
    const match = GROUP_VOUCHER_NUMBER.exec(entryNumber);
    if (!match || `${match[1]}-${match[2]}` !== period) return maximum;
    return Math.max(maximum, Number(match[3]));
  }, 0) + 1;
}

export function isGroupVoucherNumber(entryNumber: string) {
  return GROUP_VOUCHER_NUMBER.test(entryNumber);
}

export async function resolveSavedGroupVoucherNumber(
  tx: Prisma.TransactionClient,
  input: {
    batchId: number;
    year: number;
    month: number;
    existingEntryNumber?: string | null;
    supersededEntryNumber?: string | null;
  },
) {
  if (input.supersededEntryNumber) return input.supersededEntryNumber;
  if (input.existingEntryNumber && isGroupVoucherNumber(input.existingEntryNumber)) {
    return input.existingEntryNumber;
  }
  const existingNumbers = await tx.financeConsolidationEntry.findMany({
    where: { batchId: input.batchId },
    select: { entryNo: true },
  });
  return groupVoucherNumber(
    input.year,
    input.month,
    nextGroupVoucherSequence(
      existingNumbers.map((entry) => entry.entryNo),
      input.year,
      input.month,
    ),
  );
}
