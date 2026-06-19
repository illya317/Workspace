import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerWrite, withFinanceLedgerDelete } from "@workspace/platform/server/with-auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import {
  deleteFinancePeriod,
  updateFinancePeriod,
} from "@workspace/finance/server/ledger/periods";

const updatePeriodSchema = z.object({
  isClosed: z.boolean().optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceLedgerWrite(async (req, _user) => {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const parsedBody = updatePeriodSchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    return NextResponse.json(await updateFinancePeriod(parsedParams.data.id, parsedBody.data));
  })(request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withFinanceLedgerDelete(async (_req) => {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    return NextResponse.json(await deleteFinancePeriod(parsedParams.data.id));
  })(request);
}
