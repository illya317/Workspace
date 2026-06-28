import { NextResponse } from "next/server";
import { withFinanceLedgerAccess } from "@workspace/platform/server/with-auth";
import { deriveRows } from "@workspace/finance/server/ledger/reclass-results/derived";
import { jsonErrorResponse } from "@workspace/platform/server/api";

export const GET = withFinanceLedgerAccess(async (request) => {
  const { searchParams } = new URL(request.url);
  const periodId = parseInt(searchParams.get("periodId") || "", 10);
  if (!periodId) return jsonErrorResponse("periodId 为必填", 400);

  const rows = await deriveRows(periodId);

  // Map DerivedRow → API response (flat DTO)
  const items = rows.map((r) => ({
    id: r.resultId,
    periodId: r.periodId,
    voucherItemId: r.voucherItemId,
    voucherNo: r.voucherNo,
    voucherDate: r.voucherDate,
    relatedEntity: r.relatedEntity,
    description: r.description,
    sourceAccount: r.sourceAccount,
    sourceAccountName: r.sourceAccountName,
    abnormalSide: r.abnormalSide,
    itemDebit: r.itemDebit,
    itemCredit: r.itemCredit,
    targetAccount: r.targetAccount || r.suggestedTarget || "",
    amount: r.amount,
    status: r.kind === "normal" ? "no_match" : r.kind === "pending" ? "pending" : r.kind === "approved" ? "approved" : r.kind === "adjusted" ? "adjusted" : "rejected",
    note: null,
    adjustedBy: null,
    adjustedByName: null,
    adjustedAt: null,
    kind: r.kind,
    suggestedTarget: r.suggestedTarget,
  }));

  return NextResponse.json({ items, total: items.length });
});
