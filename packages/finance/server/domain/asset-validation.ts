import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export * from "../assets/validation";

export function buildAssetWorkbookImportCommand(input: { buffer: Buffer; sourceFile: string; companyCode: string; year: number; month: number; userId?: number }) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) return failCommand("导入文件为空", 400, "buffer");
  if (!input.sourceFile.trim()) return failCommand("来源文件名为空", 400, "sourceFile");
  if (!input.companyCode.trim()) return failCommand("公司为必填", 400, "companyCode");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return failCommand("年度无效", 400, "year");
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) return failCommand("月份无效", 400, "month");
  return okCommand({ ...input, sourceFile: input.sourceFile.trim(), companyCode: input.companyCode.trim() });
}
