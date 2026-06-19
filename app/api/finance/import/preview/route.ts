import { NextResponse } from "next/server";
import { withFinanceImportAccess } from "@/lib/with-auth";
import { parseBalanceSheet, parseJournal, parseAccountTable } from "@workspace/finance/server/import/import";
import { importPreviewFormSchema } from "@workspace/finance/server/import/schemas";

export const POST = withFinanceImportAccess(async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;
    const companyCode = formData.get("companyCode") as string | null;
    const yearParam = formData.get("year") as string | null;

    if (!file) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 });
    }
    if (!type || (type !== "balance" && type !== "journal" && type !== "account")) {
      return NextResponse.json({ error: "请指定导入类型：balance、journal 或 account" }, { status: 400 });
    }
    if (!companyCode) {
      return NextResponse.json({ error: "请选择公司" }, { status: 400 });
    }
    const parsed = importPreviewFormSchema.safeParse({
      file,
      type,
      companyCode,
      year: yearParam || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const buffer = Buffer.from(await parsed.data.file.arrayBuffer());

    const fileExt = parsed.data.file.name.slice(parsed.data.file.name.lastIndexOf(".")).toLowerCase();
    let result;
    if (parsed.data.type === "balance") {
      result = parseBalanceSheet(buffer, parsed.data.companyCode, fileExt);
    } else if (parsed.data.type === "journal") {
      result = parseJournal(buffer, parsed.data.companyCode, fileExt);
    } else {
      result = parseAccountTable(buffer, parsed.data.companyCode, fileExt);
    }

    // Use explicitly provided year, or extract from filename, or detect from data
    if (parsed.data.year) {
      result.year = parsed.data.year;
    } else if (result.year === 0) {
      const yearMatch = parsed.data.file.name.match(/(20\d{2})/);
      if (yearMatch) {
        result.year = parseInt(yearMatch[1], 10);
      }
    }
    result.sourceFileName = parsed.data.file.name;

    return NextResponse.json({ success: true, preview: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
