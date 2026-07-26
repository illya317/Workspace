import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export * from "../validation";

export function buildInventoryWorkbookImportCommand(input: { buffer: Buffer; sourceFile: string; companyCode: string; userId?: number }) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) return failCommand("导入文件为空", 400, "buffer");
  if (!input.sourceFile.trim()) return failCommand("来源文件名为空", 400, "sourceFile");
  if (!input.companyCode.trim()) return failCommand("公司为必填", 400, "companyCode");
  return okCommand({ ...input, sourceFile: input.sourceFile.trim(), companyCode: input.companyCode.trim() });
}
