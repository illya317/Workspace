import type { SubmitStatementSourcePackageInput } from "@workspace/finance/types";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;

export interface UploadStatementSourcePackageInput {
  file: File;
  companyCode: string;
  year: number;
  month: number;
  note?: string | null;
}

export interface UploadStatementSourcePackageCommand extends UploadStatementSourcePackageInput {
  userId: number;
  note: string | null;
}

export interface SubmitStatementSourcePackageCommand extends SubmitStatementSourcePackageInput {
  packageId: number;
  userId: number;
  note: string | null;
}

function validActor(userId: number) {
  return Number.isInteger(userId) && userId > 0;
}

function normalizedNote(value: string | null | undefined) {
  const note = value?.trim();
  return note ? note : null;
}

export function buildUploadStatementSourcePackageCommand(
  raw: UploadStatementSourcePackageInput,
  userId: number,
) {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  if (!(raw.file instanceof File)) return failCommand("请选择三表 Excel 文件", 400, "file");
  if (!/\.xlsx?$/i.test(raw.file.name)) return failCommand("来源文件必须是 xls 或 xlsx", 400, "file");
  if (raw.file.size <= 0 || raw.file.size > MAX_SOURCE_FILE_BYTES) {
    return failCommand("来源文件必须大于 0 且不超过 10MB", 400, "file");
  }
  const companyCode = raw.companyCode.trim();
  if (!companyCode || companyCode.length > 30) return failCommand("公司编号无效", 400, "companyCode");
  if (!Number.isInteger(raw.year) || raw.year < 2000 || raw.year > 2099) {
    return failCommand("来源年度无效", 400, "year");
  }
  if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
    return failCommand("来源月份无效", 400, "month");
  }
  const note = normalizedNote(raw.note);
  if (note && note.length > 1000) return failCommand("来源说明不能超过 1000 字", 400, "note");
  return okCommand<UploadStatementSourcePackageCommand>({
    ...raw,
    companyCode,
    note,
    userId,
  });
}

export function buildSubmitStatementSourcePackageCommand(
  packageId: number,
  raw: SubmitStatementSourcePackageInput,
  userId: number,
) {
  if (!validActor(userId)) return failCommand("当前用户无效", 401);
  if (!Number.isInteger(packageId) || packageId <= 0) return failCommand("来源包 ID 无效", 400, "packageId");
  if (!Number.isInteger(raw.expectedVersion) || raw.expectedVersion <= 0) {
    return failCommand("来源包版本无效", 400, "expectedVersion");
  }
  const note = normalizedNote(raw.note);
  if (note && note.length > 1000) return failCommand("提交说明不能超过 1000 字", 400, "note");
  return okCommand<SubmitStatementSourcePackageCommand>({
    packageId,
    expectedVersion: raw.expectedVersion,
    note,
    userId,
  });
}

export function buildStatementSourceScopeCommand(raw: {
  companyCode: string;
  year: number;
  month: number;
}) {
  const companyCode = raw.companyCode.trim();
  if (!companyCode) return failCommand("公司编号无效", 400, "companyCode");
  if (!Number.isInteger(raw.year) || raw.year < 2000 || raw.year > 2099) {
    return failCommand("来源年度无效", 400, "year");
  }
  if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
    return failCommand("来源月份无效", 400, "month");
  }
  return okCommand({ companyCode, year: raw.year, month: raw.month });
}
