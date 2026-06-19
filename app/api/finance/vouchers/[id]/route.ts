import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerDelete, withFinanceLedgerWrite } from "@/lib/with-auth";
import { deleteVoucher, updateVoucher } from "@workspace/finance/server/ledger/voucher-service";

type VoucherRouteContext = { params: Promise<{ id: string }> };

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const itemSchema = z.object({
  accountId: z.unknown(),
  debit: z.unknown(),
  credit: z.unknown(),
  description: z.unknown().optional(),
});

const updateVoucherSchema = z
  .object({
    date: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    items: z.array(itemSchema).optional(),
  })
  .passthrough();

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function serviceResultResponse(result: Awaited<ReturnType<typeof updateVoucher>>) {
  if ("error" in result) {
    const { error, status, ...rest } = result;
    return NextResponse.json({ error, ...rest }, { status });
  }
  return NextResponse.json(result);
}

export async function PUT(request: Request, { params }: VoucherRouteContext) {
  return withFinanceLedgerWrite(async (req, user) => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return badRequest("id 必须为正整数");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("请求体为必填");

    const parsedBody = updateVoucherSchema.safeParse(body);
    if (!parsedBody.success) return badRequest("参数无效");

    const result = await updateVoucher(parsedParams.data.id, parsedBody.data, user.userId);
    return serviceResultResponse(result);
  })(request);
}

export async function DELETE(request: Request, { params }: VoucherRouteContext) {
  return withFinanceLedgerDelete(async () => {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) return badRequest("id 必须为正整数");

    return NextResponse.json(await deleteVoucher(parsedParams.data.id));
  })(request);
}
