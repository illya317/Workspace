import { NextResponse } from "next/server";
import { withFinanceImportWrite } from "@/lib/with-auth";
import type { PreviewResult } from "@/server/services/finance/import";
import { confirmFinanceImport } from "@/server/services/finance/import-confirm";

export const POST = withFinanceImportWrite(async (request: Request) => {
  try {
    const body = await request.json();
    const { preview }: { preview: PreviewResult } = body;
    const result = await confirmFinanceImport(preview);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
