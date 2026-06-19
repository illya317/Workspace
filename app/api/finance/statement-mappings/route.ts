import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceReportAccess, withFinanceReportWrite } from "@/lib/with-auth";
import { jsonBadRequest } from "@workspace/platform/server/api";
import {
  deleteStatementMapping,
  listStatementMappings,
  saveStatementMapping,
  StatementMappingServiceError,
} from "@workspace/finance/server/statements/mapping/statement-mappings";

const mappingQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  statementType: z.literal("balance").default("balance"),
});

const saveMappingSchema = mappingQuerySchema.extend({
  accountCode: z.string().min(1),
  lineCode: z.string().min(1),
  operator: z.enum(["add", "subtract", "exclude"]).default("add"),
});

const deleteMappingSchema = mappingQuerySchema.extend({ accountCode: z.string().min(1) });
const validOperators = ["add", "subtract", "exclude"];

function readMappingQuery(request: Request) {
  const { searchParams } = new URL(request.url);
  return {
    companyCode: searchParams.get("companyCode"),
    year: searchParams.get("year"),
    statementType: searchParams.get("statementType") || "balance",
    accountCode: searchParams.get("accountCode"),
  };
}

const isMissing = (value: unknown): boolean => value === null || value === undefined || value === "";

function serviceErrorResponse(error: unknown) {
  if (error instanceof StatementMappingServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export const GET = withFinanceReportAccess(async (request) => {
  const raw = readMappingQuery(request);
  if (isMissing(raw.companyCode) || isMissing(raw.year)) {
    return jsonBadRequest("companyCode, year 为必填");
  }

  const parsed = mappingQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonBadRequest("statementType 暂只支持 balance");
  }

  try {
    return NextResponse.json(await listStatementMappings(parsed.data));
  } catch (error) {
    return serviceErrorResponse(error);
  }
});

export const POST = withFinanceReportWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonBadRequest("请求体为必填");
  }
  const payload = body as Record<string, unknown>;

  if (
    isMissing(payload.companyCode) ||
    isMissing(payload.year) ||
    isMissing(payload.statementType) ||
    isMissing(payload.accountCode) ||
    isMissing(payload.lineCode)
  ) {
    return jsonBadRequest("companyCode, year, statementType, accountCode, lineCode 为必填");
  }

  const parsed = saveMappingSchema.safeParse(body);
  if (!parsed.success) {
    if (payload.operator && !validOperators.includes(String(payload.operator))) {
      return jsonBadRequest("operator 必须为 add、subtract 或 exclude");
    }
    if (!Number.isFinite(Number(payload.year))) {
      return jsonBadRequest("year 必须为数字");
    }
    return jsonBadRequest("statementType 暂只支持 balance");
  }

  try {
    return NextResponse.json(await saveStatementMapping(parsed.data));
  } catch (error) {
    return serviceErrorResponse(error);
  }
});

export const DELETE = withFinanceReportWrite(async (request) => {
  const raw = readMappingQuery(request);
  if (isMissing(raw.companyCode) || isMissing(raw.year) || isMissing(raw.accountCode)) {
    return jsonBadRequest("companyCode, year, accountCode 为必填");
  }

  const parsed = deleteMappingSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonBadRequest("statementType 暂只支持 balance");
  }

  try {
    return NextResponse.json(await deleteStatementMapping(parsed.data));
  } catch (error) {
    return serviceErrorResponse(error);
  }
});
