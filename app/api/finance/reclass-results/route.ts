import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@/lib/with-auth";
import { listReclassResults } from "@/server/services/finance/ledger/reclass-results/list";
import { buildReclassResults } from "@/server/services/finance/ledger/reclassify";

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
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const rawPageSize = parseInt(searchParams.get("pageSize") || "50", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 50 : Math.min(rawPageSize, 200);

  const result = await listReclassResults({
    periodId, status, keyword, page, pageSize,
  });

  return NextResponse.json(result);
});

// ─── POST: 触发生成重分类结果 (Batch 6) ──────────────

export const POST = withFinanceLedgerWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体为必填" }, { status: 400 });
  }

  const periodId = parseInt(body.periodId, 10);
  if (!periodId || isNaN(periodId)) {
    return NextResponse.json({ error: "periodId 为必填且为数字" }, { status: 400 });
  }

  const dryRun = body.dryRun !== false; // default true for safety

  const result = await buildReclassResults(periodId, { dryRun });
  return NextResponse.json(result);
});
