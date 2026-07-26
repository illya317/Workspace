import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { GeneratorOutput } from "../generators/types";

export interface GeneratedDocumentInput {
  generatorKey: string;
  title: string;
  summary?: string;
  confidentialityLevel: number;
  categoryCode?: string;
  categoryName?: string;
  userId: number;
}

export interface GeneratedDocumentCommand {
  input: GeneratedDocumentInput;
  output: GeneratorOutput;
}

export function buildGeneratedDocumentCommand(
  input: GeneratedDocumentInput,
  output: GeneratorOutput,
): DomainValidationResult<GeneratedDocumentCommand> {
  const generatorKey = input.generatorKey.trim();
  const title = input.title.trim();
  if (!generatorKey) return failCommand("generatorKey is required", 400, "generatorKey");
  if (!title) return failCommand("title is required", 400, "title");
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("userId is invalid", 400, "userId");
  if (!Number.isInteger(input.confidentialityLevel) || input.confidentialityLevel < 0 || input.confidentialityLevel > 4) {
    return failCommand("confidentialityLevel must be 0..4", 400, "confidentialityLevel");
  }
  if (!output.extension?.trim()) return failCommand("generated file extension is required", 400, "extension");
  if (!output.mimeType?.trim()) return failCommand("generated file mimeType is required", 400, "mimeType");
  if (output.content == null) return failCommand("generated content is required", 400, "content");
  if (!output.fileName?.trim()) return failCommand("generated fileName is required", 400, "fileName");
  if (!output.title?.trim()) return failCommand("generated title is required", 400, "title");
  if (output.identityKey !== undefined && !output.identityKey.trim()) {
    return failCommand("generated identityKey is invalid", 400, "identityKey");
  }
  if (output.asOfDate !== undefined && Number.isNaN(Date.parse(`${output.asOfDate}T00:00:00Z`))) {
    return failCommand("generated asOfDate is invalid", 400, "asOfDate");
  }
  if (output.verifiedAt !== undefined && Number.isNaN(Date.parse(output.verifiedAt))) {
    return failCommand("generated verifiedAt is invalid", 400, "verifiedAt");
  }
  if (output.reviewStatus === "approved" && output.verifiedAt === undefined) {
    return failCommand("approved generated document requires verifiedAt", 400, "verifiedAt");
  }

  return okCommand({
    input: {
      ...input,
      generatorKey,
      title,
      summary: input.summary?.trim() || undefined,
      categoryCode: input.categoryCode?.trim() || undefined,
      categoryName: input.categoryName?.trim() || undefined,
    },
    output: {
      ...output,
      fileName: output.fileName.trim(),
      title: output.title.trim(),
      summary: output.summary?.trim() || undefined,
      extension: output.extension.trim(),
      mimeType: output.mimeType.trim(),
      identityKey: output.identityKey?.trim() || undefined,
    },
  });
}
