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
      extension: output.extension.trim(),
      mimeType: output.mimeType.trim(),
    },
  });
}
