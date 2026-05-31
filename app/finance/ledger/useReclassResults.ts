"use client";

import { useEffect, useState } from "react";
import type { ReclassResultRow } from "@/server/services/finance/ledger/reclass-results/types";

export function useReclassResults(companyCode: string, year: string, month: string, showToast: (msg: string, type?: "error") => void) {
  const [reclassMap, setReclassMap] = useState<Map<number, ReclassResultRow>>(new Map());

  useEffect(() => {
    if (!companyCode || !year || !month) { setReclassMap(new Map()); return; }
    (async () => {
      try {
        const pRes = await fetch(`/api/finance/reclass-results/lookup-period?companyCode=${companyCode}&year=${year}&month=${month}`);
        const { periodId } = await pRes.json();
        if (!periodId) { setReclassMap(new Map()); return; }
        const rRes = await fetch(`/api/finance/reclass-results?periodId=${periodId}&pageSize=200`);
        if (rRes.ok) {
          const data = await rRes.json();
          const map = new Map<number, ReclassResultRow>();
          for (const r of (data.items || [])) map.set(r.voucherItemId, r);
          setReclassMap(map);
        }
      } catch { /* ignore */ }
    })();
  }, [companyCode, year, month]);

  async function handleReview(id: number, action: "approve" | "reject" | "adjust", body?: Record<string, unknown>) {
    const res = await fetch(`/api/finance/reclass-results/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    if (res.ok) {
      showToast(action === "approve" ? "已通过" : action === "reject" ? "已驳回" : "已调整");
      setReclassMap((prev) => {
        const next = new Map(prev);
        const item = prev.get(id);
        if (item) {
          if (action === "approve") next.set(id, { ...item, status: "approved" } as ReclassResultRow);
          else if (action === "reject") next.set(id, { ...item, status: "rejected" } as ReclassResultRow);
          else next.set(id, { ...item, status: "adjusted", targetAccount: body?.targetAccount as string, amount: body?.amount as number } as ReclassResultRow);
        }
        return next;
      });
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "操作失败", "error");
    }
  }

  return { reclassMap, handleReview };
}
