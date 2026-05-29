import { NextResponse } from "next/server";
import { withFinanceWrite } from "@/lib/with-auth";
import { parseBalanceSheet, parseJournal } from "@/server/services/finance/import";

export const POST = withFinanceWrite(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const companyCode = formData.get("companyCode") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }
    if (!type || (type !== "balance" && type !== "journal")) {
      return NextResponse.json({ error: "请指定导入类型：balance 或 journal" }, { status: 400 });
    }
    if (!companyCode) {
      return NextResponse.json({ error: "请选择公司" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result =
      type === "balance"
        ? parseBalanceSheet(buffer, companyCode)
        : parseJournal(buffer, companyCode);

    return NextResponse.json({ success: true, preview: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
