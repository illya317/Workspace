import { NextResponse } from "next/server";
import { withFinanceCostAccess, withFinanceCostWrite } from "@/lib/with-auth";
import { listImports } from "@workspace/finance/server/cost";

export async function GET(request: Request) {
  return withFinanceCostAccess(async (req) => {
    const { searchParams } = new URL(req.url);
    const params = {
      page: searchParams.has("page") ? parseInt(searchParams.get("page")!) : undefined,
      pageSize: searchParams.has("pageSize") ? parseInt(searchParams.get("pageSize")!) : undefined,
    };

    const result = await listImports(params);
    return NextResponse.json({ success: true, ...result });
  })(request);
}

export async function POST(request: Request) {
  return withFinanceCostWrite(async (_req) => {
    // The actual import is handled by the standalone script.
    // This endpoint can trigger a background import or accept a manual payload.
    // For now, return a guide message.
    return NextResponse.json(
      {
        success: false,
        error: "请使用导入脚本: node scripts/import-finance-cost-json.mjs",
      },
      { status: 400 },
    );
  })(request);
}
