"use client";

import { workspacePath } from "@workspace/core/routing";
import type {
  ConsolidatedReportOutputPackage,
  ConsolidationBatchStatus,
} from "@workspace/finance/types";
import { useEffect, useState } from "react";

interface ConsolidatedReportResponse {
  report: ConsolidatedReportOutputPackage;
}

export function useConsolidatedReport(batchId: number | null, status: ConsolidationBatchStatus | null) {
  const [report, setReport] = useState<ConsolidatedReportOutputPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batchId === null || (status !== "locked" && status !== "published")) {
      setReport(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(workspacePath(`/api/modules/finance/statements/consolidation/batches/${batchId}/report`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "合并报表加载失败";
          throw new Error(message);
        }
        return payload as ConsolidatedReportResponse;
      })
      .then((payload) => setReport(payload.report))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setReport(null);
        setError(cause instanceof Error ? cause.message : "合并报表加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [batchId, status]);

  return { report, loading, error };
}
