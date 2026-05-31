import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
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
    if (!resultId) {
      return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
    }

    let body: ReviewPayload;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    // 参数校验
    if (!["approve", "reject", "adjust", "revert"].includes(body.action)) {
      return NextResponse.json(
        { error: "action 必须为 approve / reject / adjust / revert" },
        { status: 400 },
      );
    }

    try {
      const result = await reviewReclassResult({
        id: resultId,
        payload: body,
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
