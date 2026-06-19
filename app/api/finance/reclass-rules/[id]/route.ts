import { NextResponse } from "next/server";

import { withFinanceLedgerWrite } from "@/lib/with-auth";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { deleteReclassRule } from "@workspace/finance/server/ledger/reclass-rules";

/** 规则删除：仅允许通过 write 权限操作自己的规则 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceLedgerWrite(async () => {
    const parsedParams = routeIdParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "无效的规则 ID" }, { status: 400 });
    }

    const result = await deleteReclassRule(parsedParams.data.id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json(result);
  })(request);
}
