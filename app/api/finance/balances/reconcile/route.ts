import { NextResponse } from "next/server";
import { z } from "zod";
import { withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import { reconcileBalanceSheet } from "@workspace/finance/server/ledger/balance-reconcile";

const reconcileFormSchema = z.object({
  file: z.instanceof(File),
  companyCode: z.string().min(1),
});

/** POST 上传会计软件年度余额表，与“年度基准 + 系统凭证滚动计算结果”核对 */
export const POST = withFinanceLedgerWrite(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const companyCode = formData.get("companyCode") as string | null;

    if (!file) return NextResponse.json({ error: "请上传余额表文件" }, { status: 400 });
    if (!companyCode) return NextResponse.json({ error: "请选择公司" }, { status: 400 });
    const parsed = reconcileFormSchema.safeParse({ file, companyCode });
    if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

    const buffer = Buffer.from(await parsed.data.file.arrayBuffer());
    const fileExt = parsed.data.file.name.slice(parsed.data.file.name.lastIndexOf(".")).toLowerCase();
    const result = await reconcileBalanceSheet(buffer, parsed.data.companyCode, fileExt);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "核对失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
