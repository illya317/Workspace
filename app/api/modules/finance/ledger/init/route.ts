import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import { initializeFinanceDefaults } from "@workspace/finance/server/ledger/periods";

const initFinanceSchema = z.object({
  year: z.coerce.number().int().default(2025),
  month: z.coerce.number().int().min(1).max(12).default(1),
  companyCode: z.string().trim().min(1),
});

/** 初始化财务基础数据：默认期间 + 标准科目 */
export const POST = withFinanceLedgerWrite(async (request: Request, user) => {
  const parsed = initFinanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "companyCode 为必填" }, { status: 400 });
  }

  return NextResponse.json(await initializeFinanceDefaults(parsed.data, user.userId));
});
