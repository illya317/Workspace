import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { parseBusinessDate } from "@workspace/platform/contracts/business-temporal";

export interface PositionDescriptionUpdateInput {
  id?: unknown;
  positionPurpose?: unknown;
  summary?: unknown;
  headcount?: unknown;
  version?: unknown;
  effectiveDate?: unknown;
  sourceFile?: unknown;
  details?: unknown;
  revisionUid?: unknown;
  expectedSequence?: unknown;
  changeKind?: unknown;
  changeReason?: unknown;
}

export interface PositionDescriptionUpdateCommand {
  id: number;
  revisionUid: string;
  expectedSequence: number;
  changeKind: "change" | "correction";
  changeReason: string | null;
  revision: {
    positionPurpose: string | null;
    summary: string | null;
    headcount: number | null;
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

export function assertPositionDescriptionRevisionDraft(input: PositionDescriptionUpdateCommand["revision"] | null | undefined) {
  if (!input) return;
  if (input.headcount !== null && (!Number.isInteger(input.headcount) || input.headcount < 1)) {
    throw new Error("岗位说明书编制必须是正整数");
  }
  if (input.effectiveDate && !parseBusinessDate(input.effectiveDate)) {
    throw new Error("岗位说明书生效日期无效");
  }
  if (input.details !== undefined && input.details !== null) JSON.parse(input.details);
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

  const revisionUid = String(input.revisionUid || "").trim();
  if (!revisionUid) return failCommand("缺少 Idempotency-Key", 400);
  const expectedSequence = Number(input.expectedSequence);
  if (!Number.isInteger(expectedSequence) || expectedSequence < 1) return failCommand("缺少或无效的当前修订序号", 409);
  const changeKind = input.changeKind === "correction" ? "correction" : "change";
  const changeReason = nullableText(input.changeReason);
  if (changeKind === "correction" && !changeReason) return failCommand("纠错必须填写原因", 400);

  const headcount = input.headcount === null || input.headcount === undefined || input.headcount === "" ? null : Number(input.headcount);
  if (headcount !== null && (!Number.isInteger(headcount) || headcount < 1)) {
    return failCommand("编制必须是正整数");
  }

  const effectiveDate = nullableText(input.effectiveDate);
  if (effectiveDate && !parseBusinessDate(effectiveDate)) return failCommand("生效日期必须是合法 YYYY-MM-DD 业务日期", 400);

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
    revisionUid,
    expectedSequence,
    changeKind,
    changeReason,
    revision: {
      positionPurpose: nullableText(input.positionPurpose),
      summary: nullableText(input.summary),
      headcount,
      version: nullableText(input.version),
      effectiveDate,
      sourceFile: input.sourceFile ? String(input.sourceFile) : "",
      ...(hasDetailsInput ? { details } : {}),
    },
  });
}
