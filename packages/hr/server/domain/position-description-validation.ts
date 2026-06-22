import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface PositionDescriptionUpdateInput {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  departmentName?: unknown;
  reportTo?: unknown;
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
    code: string;
    name: string;
    departmentName: string | null;
    reportTo: string | null;
    positionPurpose: string | null;
    summary: string | null;
    headcount: number;
    version: string | null;
    effectiveDate: string | null;
    sourceFile: string;
    details: string | null;
  };
}

function nullableText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export function buildPositionDescriptionUpdateCommand(
  input: PositionDescriptionUpdateInput,
): DomainValidationResult<PositionDescriptionUpdateCommand> {
  if (!input.id) return failCommand("缺少id");
  if (!input.code || !input.name) return failCommand("说明书编码和名称不能为空");

  const headcount = input.headcount === null || input.headcount === undefined || input.headcount === "" ? null : Number(input.headcount);
  if (headcount === null || !Number.isInteger(headcount) || headcount < 1) {
    return failCommand("编制必须是正整数");
  }

  let details: string | null = null;
  if (input.details !== undefined && input.details !== null && input.details !== "") {
    try {
      const parsed = typeof input.details === "string" ? JSON.parse(input.details) : input.details;
      details = JSON.stringify(parsed);
    } catch {
      return failCommand("说明书 JSON 不是合法格式");
    }
  }

  return okCommand({
    id: Number(input.id),
    data: {
      code: String(input.code).trim(),
      name: String(input.name).trim(),
      departmentName: nullableText(input.departmentName),
      reportTo: nullableText(input.reportTo),
      positionPurpose: nullableText(input.positionPurpose),
      summary: nullableText(input.summary),
      headcount,
      version: nullableText(input.version),
      effectiveDate: nullableText(input.effectiveDate),
      sourceFile: input.sourceFile ? String(input.sourceFile) : "",
      details,
    },
  });
}
