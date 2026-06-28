import path from "node:path";

import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";

import {
  parseAccountTable,
  parseBalanceSheet,
  parseJournal,
  type PreviewResult,
} from "./import";
import { confirmFinanceImport } from "./import-confirm";
import type { importPreviewFormSchema } from "./schemas";
import type { z } from "zod";

type FinanceImportPreviewCommand = z.infer<typeof importPreviewFormSchema>;

export function buildFinanceImportPreviewCommand(input: FinanceImportPreviewCommand) {
  return okCommand(input);
}

export async function executeFinanceImportPreviewCommand(command: FinanceImportPreviewCommand) {
  try {
    const buffer = Buffer.from(await command.file.arrayBuffer());
    const fileExt = path.extname(command.file.name).toLowerCase();
    let preview: PreviewResult;
    if (command.type === "account") {
      preview = parseAccountTable(buffer, command.companyCode, fileExt);
    } else if (command.type === "journal") {
      preview = parseJournal(buffer, command.companyCode, fileExt);
    } else {
      preview = parseBalanceSheet(buffer, command.companyCode, fileExt);
    }
    preview.sourceFileName = command.file.name;
    if (command.year) preview.year = command.year;
    return serviceOk({ preview });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "导入预览失败", 400);
  }
}

export function buildFinanceImportConfirmCommand(preview: PreviewResult, userId: number) {
  return okCommand({ preview, userId });
}

export async function executeFinanceImportConfirmCommand(command: { preview: PreviewResult; userId: number }) {
  try {
    const result = await confirmFinanceImport(command.preview, command.userId);
    return serviceOk(result);
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "导入确认失败", 400);
  }
}
