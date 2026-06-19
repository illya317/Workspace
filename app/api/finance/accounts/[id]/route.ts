import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerDelete, withFinanceLedgerWrite } from "@/lib/with-auth";
import {
  deleteFinanceAccount,
  updateFinanceAccount,
} from "@workspace/finance/server/ledger/accounts";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateAccountSchema = z.object({
  code: z.unknown().optional(),
  name: z.unknown().optional(),
  category: z.unknown().optional(),
  balanceDirection: z.unknown().optional(),
  isActive: z.unknown().optional(),
  sortOrder: z.unknown().optional(),
  reclassTargetCode: z.unknown().optional(),
  companyCode: z.unknown().optional(),
  mnemonicCode: z.unknown().optional(),
  currency: z.unknown().optional(),
  groupSubjectCode: z.unknown().optional(),
  subjectLevel: z.unknown().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async (req, user) => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const parsedBody = updateAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    return NextResponse.json(
      await updateFinanceAccount(parsedParams.data.id, parsedBody.data, user.userId),
    );
  })(request);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerDelete(async (_req, user) => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    return NextResponse.json(await deleteFinanceAccount(parsedParams.data.id, user.userId));
  })(request);
}
