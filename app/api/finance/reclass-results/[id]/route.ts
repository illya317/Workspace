import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import {
  reviewReclassResult,
  createManualReclassResult,
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

    // id=0 → 手动创建 ReclassResult + 沉淀例外规则 + 全公司同步
    if (resultId === 0) {
      const { periodId, voucherItemId, sourceAccount, targetAccount, amount } = body;
      if (!periodId || !voucherItemId || !targetAccount) {
        return NextResponse.json({ error: "缺少 periodId / voucherItemId / targetAccount" }, { status: 400 });
      }
      try {
        const item = await createManualReclassResult({
          periodId, voucherItemId, sourceAccount: sourceAccount || "",
          targetAccount, amount: amount || 0, userId: user.userId,
        });
        return NextResponse.json({ item });
      } catch (err) {
        if (err instanceof ReviewError) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
        throw err;
      }
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
