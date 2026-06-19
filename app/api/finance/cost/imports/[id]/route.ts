import { NextResponse } from "next/server";
import { withFinanceCostAccess, withFinanceCostDelete } from "@workspace/platform/server/with-auth";
import { deleteImportById, getImportById } from "@workspace/finance/server/cost";
import { costImportIdSchema } from "@workspace/finance/server/cost/import-schemas";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceCostDelete(async () => {
    const parsedParams = costImportIdSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ success: false, error: "无效ID" }, { status: 400 });
    }
    const numericId = parsedParams.data.id;

    const existing = await getImportById(numericId);
    if (!existing) {
      return NextResponse.json({ success: false, error: "记录不存在" }, { status: 404 });
    }

    await deleteImportById(numericId);
    return NextResponse.json({ success: true });
  })(request);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withFinanceCostAccess(async () => {
    const parsedParams = costImportIdSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ success: false, error: "无效ID" }, { status: 400 });
    }
    const numericId = parsedParams.data.id;

    const data = await getImportById(numericId);
    if (!data) {
      return NextResponse.json({ success: false, error: "记录不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  })(request);
}
