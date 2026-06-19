import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import {
  createFinanceAccount,
  listFinanceAccounts,
  type FinanceAccountScope,
} from "@workspace/finance/server/ledger/accounts";

const listAccountsQuerySchema = z.object({
  companyCode: z.string().optional(),
  subjectLevel: z.string().optional(),
  scope: z.enum(["mapped", "unmapped", "inactive", "all"]).optional(),
  year: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(2000).default(50),
});

const createAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  parentId: z.unknown().optional(),
  balanceDirection: z.unknown().optional(),
  companyCode: z.unknown().optional(),
  mnemonicCode: z.unknown().optional(),
  currency: z.unknown().optional(),
  groupSubjectCode: z.unknown().optional(),
  subjectLevel: z.unknown().optional(),
  isActive: z.unknown().optional(),
  sortOrder: z.unknown().optional(),
});

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = listAccountsQuerySchema.safeParse({
    companyCode: searchParams.get("companyCode") || undefined,
    subjectLevel: searchParams.get("subjectLevel") || undefined,
    scope: (searchParams.get("scope") || "mapped") as FinanceAccountScope,
    year: searchParams.get("year") || undefined,
    keyword: searchParams.get("keyword") || undefined,
    page: searchParams.get("page") || undefined,
    pageSize: searchParams.get("pageSize") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  return NextResponse.json(await listFinanceAccounts(parsed.data));
});

export const POST = withFinanceLedgerWrite(async (request, user) => {
  const parsed = createAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "科目编码、名称、类别为必填" }, { status: 400 });
  }

  return NextResponse.json(await createFinanceAccount(parsed.data, user.userId));
});
