import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceReportAccess } from "@/lib/with-auth";
import { generateFinanceReport } from "@workspace/finance/server/statements/report-generator";

const optionalPositiveInt = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);
const optionalYear = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().min(2020).max(2099).optional(),
);
const optionalMonth = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().min(1).max(12).optional(),
);

const reportQuerySchema = z
  .object({
    periodId: optionalPositiveInt,
    companyCode: z.string().optional(),
    year: optionalYear,
    month: optionalMonth,
    type: z.enum(["balance", "income", "cashflow"]),
  })
  .superRefine((data, ctx) => {
    if (data.periodId || (data.companyCode && data.year !== undefined && data.month !== undefined)) return;
    ctx.addIssue({
      code: "custom",
      path: ["periodId"],
      message: "periodId 或 companyCode+year+month 为必填",
    });
  });

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export const GET = withFinanceReportAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());
  if (!raw.type) return badRequest("type 为必填（balance/income/cashflow）");

  const parsed = reportQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return badRequest(issue?.message || "参数无效");
  }

  return generateFinanceReport({
    periodId: parsed.data.periodId,
    companyCode: parsed.data.companyCode,
    year: parsed.data.year,
    month: parsed.data.month,
    reportType: parsed.data.type,
  });
});
