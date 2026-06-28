import { NextResponse } from "next/server";
import { withFinanceLedgerAccess, withFinanceLedgerWrite } from "@workspace/platform/server/with-auth";
import { listReclassResults } from "@workspace/finance/server/ledger/reclass-results/list";
import {
  buildReclassResultsSchema,
  listReclassResultsSchema,
} from "@workspace/finance/server/ledger/reclass-results/schemas";
import { buildReclassResults } from "@workspace/finance/server/ledger/reclassify";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const raw = Object.fromEntries(searchParams.entries());
  if (!raw.periodId) {
    return jsonErrorResponse("periodId 为必填参数", 400);
  }
  const parsed = listReclassResultsSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonErrorResponse("periodId 为必填参数", 400);
  }

  const result = await listReclassResults({
    periodId: parsed.data.periodId,
    status: parsed.data.status,
    keyword: parsed.data.keyword,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });

  return NextResponse.json(result);
});

// ─── POST: 触发生成重分类结果 (Batch 6) ──────────────

export const POST = withFinanceLedgerWrite(async (request) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonErrorResponse("请求体为必填", 400);
  }
  const parsed = buildReclassResultsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErrorResponse("periodId 为必填且为数字", 400);
  }

  const dryRun = parsed.data.dryRun !== false; // default true for safety

  const result = await buildReclassResults(parsed.data.periodId, { dryRun });
  return NextResponse.json(result);
});
