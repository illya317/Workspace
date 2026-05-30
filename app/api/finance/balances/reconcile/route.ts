import { NextResponse } from "next/server";
import { withFinanceLedgerWrite } from "@/lib/with-auth";
import { reconcileBalanceSheet } from "@/server/services/finance/balance-reconcile";

/** POST 上传会计软件年度余额表，与“年度基准 + 系统凭证滚动计算结果”核对 */
export const POST = withFinanceLedgerWrite(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyCode = formData.get("companyCode") as string | null;

    if (!file) return NextResponse.json({ error: "请上传余额表文件" }, { status: 400 });
    if (!companyCode) return NextResponse.json({ error: "请选择公司" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const result = await reconcileBalanceSheet(buffer, companyCode, fileExt);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "核对失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
