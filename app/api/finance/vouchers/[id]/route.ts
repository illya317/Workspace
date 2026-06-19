import { NextResponse } from "next/server";
import { z } from "zod";

import { withFinanceLedgerDelete, withFinanceLedgerWrite } from "@/lib/with-auth";
import { jsonBadRequest, jsonResultResponse, routeIdParamsSchema } from "@workspace/platform/server/api";
import { deleteVoucher, updateVoucher } from "@workspace/finance/server/ledger/voucher-service";

type VoucherRouteContext = { params: Promise<{ id: string }> };

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

export async function PUT(request: Request, { params }: VoucherRouteContext) {
  return withFinanceLedgerWrite(async (req, user) => {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) return jsonBadRequest("id 必须为正整数");

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonBadRequest("请求体为必填");

    const parsedBody = updateVoucherSchema.safeParse(body);
    if (!parsedBody.success) return jsonBadRequest("参数无效");

    const result = await updateVoucher(parsedParams.data.id, parsedBody.data, user.userId);
    return jsonResultResponse(result);
  })(request);
}

export async function DELETE(request: Request, { params }: VoucherRouteContext) {
  return withFinanceLedgerDelete(async () => {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) return jsonBadRequest("id 必须为正整数");

    return NextResponse.json(await deleteVoucher(parsedParams.data.id));
  })(request);
}
