import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceReportAccess, withFinanceReportWrite } from "@workspace/platform/server/with-auth";
import {
  getStatementConfigView,
  saveStatementConfigLines,
} from "@workspace/finance/server/statements/statement-config-view";

const statementConfigQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  type: z.literal("balance").default("balance"),
});

const statementConfigLineSchema = z.object({
  lineCode: z.string().min(1),
  prefixes: z.array(z.unknown()).optional(),
  subtractPrefixes: z.array(z.unknown()).optional(),
  reclassSource: z.boolean().optional(),
  reclassTarget: z.boolean().optional(),
  label: z.string().optional(),
  section: z.string().optional(),
  enabled: z.boolean().optional(),
});

const saveStatementConfigSchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  lines: z.array(statementConfigLineSchema),
});

// GET: 报表配置视图（lineConfigs + accountTree + mappingPreview）
// 权限：finance.statement access
export const GET = withFinanceReportAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const companyCode = searchParams.get("companyCode");
  const year = searchParams.get("year");
  if (!companyCode || !year)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  const type = searchParams.get("type") || "balance";
  const parsed = statementConfigQuerySchema.safeParse({ companyCode, year, type });
  if (!parsed.success && type !== "balance")
    return NextResponse.json({ error: "statement-config 暂只支持 balance" }, { status: 400 });
  if (!parsed.success)
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });

  const view = await getStatementConfigView(parsed.data.companyCode, parsed.data.year, parsed.data.type);
  return NextResponse.json(view);
});

// PUT: 批量保存配置行
// 权限：finance.statement write
export const PUT = withFinanceReportWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.lines))
    return NextResponse.json({ error: "lines 数组为必填" }, { status: 400 });

  const parsed = saveStatementConfigSchema.safeParse(body);
  if (!parsed.success && (!body.companyCode || !body.year))
    return NextResponse.json({ error: "companyCode, year 为必填" }, { status: 400 });
  if (!parsed.success)
    return NextResponse.json({ error: "参数无效" }, { status: 400 });

  return NextResponse.json(await saveStatementConfigLines(parsed.data));
});
