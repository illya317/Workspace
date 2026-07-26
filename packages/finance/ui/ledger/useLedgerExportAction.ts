"use client";

import { workspacePath } from "@workspace/core/routing";
import { useFeedback, type SurfaceToolbarItems } from "@workspace/core/ui";
import type {
  FinanceCounterpartyBalanceCategory,
  FinanceLedgerExportView,
} from "../../types/ledger";
import { useCallback, useState } from "react";
import { downloadFinanceWorkbook } from "../components/downloadFinanceWorkbook";

interface LedgerExportActionInput {
  canExport: boolean;
  view: FinanceLedgerExportView;
  companyCode?: string;
  year?: string;
  month?: string;
  keyword?: string;
  subjectLevel?: string;
  scope?: string;
  category?: FinanceCounterpartyBalanceCategory;
  disabled?: boolean;
  fallbackFilename: string;
}

export function useLedgerExportAction(input: LedgerExportActionInput): SurfaceToolbarItems[number] | null {
  const [downloading, setDownloading] = useState(false);
  const feedback = useFeedback();
  const download = useCallback(async () => {
    if (!input.canExport || input.disabled || downloading) return;
    setDownloading(true);
    try {
      const query = new URLSearchParams({ view: input.view });
      setQuery(query, "companyCode", input.companyCode);
      setQuery(query, "year", input.year);
      setQuery(query, "month", input.month);
      setQuery(query, "keyword", input.keyword?.trim());
      setQuery(query, "subjectLevel", input.subjectLevel);
      setQuery(query, "scope", input.scope);
      setQuery(query, "category", input.category);
      await downloadFinanceWorkbook(
        workspacePath(`/api/modules/finance/ledger/export?${query.toString()}`),
        input.fallbackFilename,
        "总账 Excel 下载失败",
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "总账 Excel 下载失败");
    } finally {
      setDownloading(false);
    }
  }, [downloading, feedback, input]);

  if (!input.canExport) return null;
  return {
    kind: "action-group",
    key: `${input.view}-excel-export`,
    actions: [{
      key: "export",
      kind: "download",
      label: downloading ? "下载中" : "下载Excel",
      disabled: Boolean(input.disabled) || downloading,
      onClick: () => void download(),
    }],
  };
}

function setQuery(query: URLSearchParams, key: string, value: string | undefined) {
  if (value) query.set(key, value);
}
