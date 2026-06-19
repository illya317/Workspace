import { NextResponse } from "next/server";
import { withFinanceImportWrite } from "@workspace/platform/server/with-auth";
import { confirmFinanceImport } from "@workspace/finance/server/import/import-confirm";
import { importConfirmBodySchema } from "@workspace/finance/server/import/schemas";

export const POST = withFinanceImportWrite(async (request: Request, user) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = importConfirmBodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "preview 为必填" }, { status: 400 });

    const result = await confirmFinanceImport(parsed.data.preview, user.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
