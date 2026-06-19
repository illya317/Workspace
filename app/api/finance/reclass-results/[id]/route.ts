import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import {
  reviewReclassResult,
  createManualReclassResult,
  ReviewError,
} from "@workspace/finance/server/ledger/reclass-results/review";
import {
  manualReclassResultSchema,
  reclassResultIdSchema,
  reviewReclassPayloadSchema,
} from "@workspace/finance/server/ledger/reclass-results/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async (req, user) => {
    const parsedParams = reclassResultIdSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
    }
    const resultId = parsedParams.data.id;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
    }

    // id=0 → 手动创建 ReclassResult + 沉淀例外规则 + 全公司同步
    if (resultId === 0) {
      const parsedBody = manualReclassResultSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json({ error: "缺少 periodId / voucherItemId / targetAccount" }, { status: 400 });
      }
      try {
        const item = await createManualReclassResult({
          periodId: parsedBody.data.periodId,
          voucherItemId: parsedBody.data.voucherItemId,
          sourceAccount: parsedBody.data.sourceAccount,
          targetAccount: parsedBody.data.targetAccount,
          amount: parsedBody.data.amount,
          userId: user.userId,
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

    const parsedBody = reviewReclassPayloadSchema.safeParse(body);
    if (!parsedBody.success) {
      const action = "action" in body ? body.action : undefined;
      if (action === "adjust") {
        return NextResponse.json(
          { error: "调整操作需提供有效的 targetAccount 和 amount > 0" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "action 必须为 approve / reject / adjust / revert / mark_pending" },
        { status: 400 },
      );
    }

    try {
      const result = await reviewReclassResult({
        id: resultId,
        payload: parsedBody.data,
        userId: user.userId,
      });
      return NextResponse.json({ item: result });
    } catch (err) {
      if (err instanceof ReviewError) {
        const statusMap: Record<string, number> = {
          INVALID_AMOUNT: 400,
          INVALID_SOURCE: 400,
          REJECTED: 409,
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
