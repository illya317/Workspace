import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import {
  scanCandidates,
  upsertReclassRule,
} from "@workspace/finance/server/ledger/reclass-rules";
import { ensureReclassRulesForYear } from "@workspace/finance/server/ledger/reclass-rules/ensure";

const scanRulesQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
});

const upsertRuleSchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  sourceAccountCode: z.string().min(1),
  abnormalSide: z.enum(["debit", "credit", "both"]),
  targetAccountCode: z.string().min(1),
  enabled: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

// ─── GET: 扫描候选 ────────────────────────────────────────

export const GET = withFinanceLedgerAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");

  if (!companyCode || !year) {
    return NextResponse.json(
      { error: "companyCode 和 year 为必填" },
      { status: 400 },
    );
  }

  const parsed = scanRulesQuerySchema.safeParse({ companyCode, year });
  if (!parsed.success) {
    return NextResponse.json({ error: "year 必须为数字" }, { status: 400 });
  }

  // 确保该年度有规则（无则从上年继承）
  await ensureReclassRulesForYear(parsed.data.companyCode, parsed.data.year);

  const result = await scanCandidates(parsed.data);

  return NextResponse.json(result);
});

// ─── PUT: 创建或更新规则 ──────────────────────────────────

export const PUT = withFinanceLedgerWrite(async (request: Request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体为必填" }, { status: 400 });
  }

  const requiredFields = ["companyCode", "year", "sourceAccountCode", "abnormalSide", "targetAccountCode"] as const;
  if (requiredFields.some((field) => !body[field])) {
    return NextResponse.json(
      { error: "companyCode, year, sourceAccountCode, abnormalSide, targetAccountCode 为必填" },
      { status: 400 },
    );
  }

  const parsed = upsertRuleSchema.safeParse(body);
  if (!parsed.success && parsed.error.issues.some((issue) => issue.path[0] === "year")) {
    return NextResponse.json({ error: "year 必须为数字" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "abnormalSide 必须为 debit、credit 或 both" },
      { status: 400 },
    );
  }

  return NextResponse.json(await upsertReclassRule(parsed.data));
});
