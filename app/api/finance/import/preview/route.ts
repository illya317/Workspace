import { NextResponse } from "next/server";
import { withFinanceWrite } from "@/lib/with-auth";
import { parseBalanceSheet, parseJournal, parseAccountTable } from "@/server/services/finance/import";

export const POST = withFinanceWrite(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const companyCode = formData.get("companyCode") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }
    if (!type || (type !== "balance" && type !== "journal" && type !== "account")) {
      return NextResponse.json({ error: "请指定导入类型：balance、journal 或 account" }, { status: 400 });
    }
    if (!companyCode) {
      return NextResponse.json({ error: "请选择公司" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let result;
    if (type === "balance") {
      result = parseBalanceSheet(buffer, companyCode);
    } else if (type === "journal") {
      result = parseJournal(buffer, companyCode);
    } else {
      result = parseAccountTable(buffer, companyCode);
    }

    // Extract year from filename if not detected from data
    if (result.year === 0) {
      const yearMatch = file.name.match(/(20\d{2})/);
      if (yearMatch) {
        result.year = parseInt(yearMatch[1], 10);
      }
    }

    return NextResponse.json({ success: true, preview: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
