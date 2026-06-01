import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import {
  reviewReclassResult,
  ReviewError,
} from "@/server/services/finance/ledger/reclass-results/review";
import type { ReviewPayload } from "@/server/services/finance/ledger/reclass-results/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async (req, user) => {
    const { id } = await params;
    const resultId = parseInt(id, 10);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    // id=0 → create new ReclassResult for no_match item
    if (resultId === 0) {
      const { periodId, voucherItemId, targetAccount, amount } = body;
      if (!periodId || !voucherItemId) {
        return NextResponse.json({ error: "缺少 periodId / voucherItemId" }, { status: 400 });
      }
      const created = await prisma.reclassResult.create({
        data: {
          periodId,
          voucherItemId,
          sourceAccount: body.sourceAccount || "",
          targetAccount,
          amount: amount || 0,
          status: body.action === "mark_pending" ? "pending" : "approved",
        },
        include: {
          voucherItem: {
            select: {
              relatedEntity: true,
              description: true,
              account: { select: { name: true } },
              voucher: { select: { voucherNo: true, date: true } },
            },
          },
          rule: { select: { abnormalSide: true } },
          reviewer: { select: { name: true } },
        },
      });
      return NextResponse.json({
        item: {
          id: created.id,
          periodId: created.periodId,
          voucherItemId: created.voucherItemId,
          voucherNo: created.voucherItem.voucher.voucherNo,
          voucherDate: created.voucherItem.voucher.date,
          relatedEntity: created.voucherItem.relatedEntity,
          description: created.voucherItem.description,
          sourceAccount: created.sourceAccount,
          sourceAccountName: created.voucherItem.account.name,
          abnormalSide: created.rule?.abnormalSide ?? null,
          itemDebit: 0,
          itemCredit: 0,
          targetAccount: created.targetAccount,
          amount: created.amount,
          status: created.status as any,
          note: created.note,
          adjustedBy: created.adjustedBy,
          adjustedByName: created.reviewer?.name ?? null,
          adjustedAt: created.adjustedAt?.toISOString() ?? null,
        },
      });
    }

    if (!resultId) {
      return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
    }

    // 参数校验
    if (!["approve", "reject", "adjust", "revert", "mark_pending"].includes(body.action)) {
      return NextResponse.json(
        { error: "action 必须为 approve / reject / adjust / revert / mark_pending" },
        { status: 400 },
      );
    }

    try {
      const result = await reviewReclassResult({
        id: resultId,
        payload: body as ReviewPayload,
        userId: user.userId,
      });
      return NextResponse.json({ item: result });
    } catch (err) {
      if (err instanceof ReviewError) {
        const statusMap: Record<string, number> = {
          NOT_FOUND: 404,
          NOT_PENDING: 409,
          ALREADY_PENDING: 409,
          INVALID_ADJUST: 400,
          INVALID_TARGET: 400,
          INVALID_ACTION: 400,
          AMOUNT_EXCEEDED: 400,
        };
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: statusMap[err.code] || 400 },
        );
      }
      throw err;
    }
  })(request);
}
