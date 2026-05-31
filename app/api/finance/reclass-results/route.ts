import { NextResponse } from "next/server";
import { withFinanceLedgerAccess } from "@/lib/with-auth";
import { listReclassResults } from "@/server/services/finance/ledger/reclass-results/list";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);

  const periodId = parseInt(searchParams.get("periodId") || "", 10);
  if (!periodId) {
    return NextResponse.json({ error: "periodId 为必填参数" }, { status: 400 });
  }

  const statusParam = searchParams.get("status") || "pending";
  const status = ["pending", "approved", "adjusted", "rejected", "all"].includes(statusParam)
    ? (statusParam as "pending" | "approved" | "adjusted" | "rejected" | "all")
    : "pending";

  const keyword = searchParams.get("keyword") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 200);

  const result = await listReclassResults({
    periodId, status, keyword, page, pageSize,
  });

  return NextResponse.json(result);
});
