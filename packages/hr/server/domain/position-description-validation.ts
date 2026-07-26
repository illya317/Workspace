import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";

export interface PositionDescriptionUpdateInput {
  id?: unknown;
  positionPurpose?: unknown;
  summary?: unknown;
  headcount?: unknown;
  version?: unknown;
  effectiveDate?: unknown;
  sourceFile?: unknown;
  details?: unknown;
}

export interface PositionDescriptionUpdateCommand {
  id: number;
  data: {
    positionPurpose: string | null;
    summary: string | null;
    headcount: number;
    version: string | null;
    effectiveDate: string | null;
    sourceFile: string;
    details?: string | null;
  };
}

function nullableText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export async function buildPositionDescriptionUpdateCommand(
  input: PositionDescriptionUpdateInput,
): Promise<DomainValidationResult<PositionDescriptionUpdateCommand>> {
  if (!input.id) return failCommand("缺少id");
  const descriptionId = Number(input.id);
  if (!Number.isInteger(descriptionId) || descriptionId <= 0) return failCommand("岗位说明书ID无效");
  const ownerPosition = await prisma.position.findFirst({
    where: { positionDescriptionId: descriptionId },
    select: { id: true },
  });
  if (!ownerPosition) return failCommand("岗位说明书未绑定岗位", 404);

  const headcount = input.headcount === null || input.headcount === undefined || input.headcount === "" ? null : Number(input.headcount);
  if (headcount === null || !Number.isInteger(headcount) || headcount < 1) {
    return failCommand("编制必须是正整数");
  }

  const hasDetailsInput = input.details !== undefined;
  let details: string | null | undefined;
  if (hasDetailsInput) {
    details = null;
    if (input.details !== null && input.details !== "") {
      try {
        const parsed = typeof input.details === "string" ? JSON.parse(input.details) : input.details;
        details = JSON.stringify(parsed);
      } catch {
        return failCommand("说明书 JSON 不是合法格式");
      }
    }
  }

  return okCommand({
    id: descriptionId,
    data: {
      positionPurpose: nullableText(input.positionPurpose),
      summary: nullableText(input.summary),
      headcount,
      version: nullableText(input.version),
      effectiveDate: nullableText(input.effectiveDate),
      sourceFile: input.sourceFile ? String(input.sourceFile) : "",
      ...(hasDetailsInput ? { details } : {}),
    },
  });
}
