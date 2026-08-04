"use client";

import { workspacePath } from "@workspace/core/routing";
import { useFeedback, type SurfaceToolbarItems } from "@workspace/core/ui";
import { useCallback, useState } from "react";
import { downloadFinanceWorkbook } from "../workbook-download";

export function useTreasuryExportAction(input: {
  canExport: boolean;
  companyCode?: string;
  year?: string;
  month?: string;
  disabled?: boolean;
  fallbackFilename: string;
}): SurfaceToolbarItems[number] | null {
  const [downloading, setDownloading] = useState(false);
  const feedback = useFeedback();
  const download = useCallback(async () => {
    if (!input.canExport || input.disabled || downloading) return;
    setDownloading(true);
    try {
      const query = new URLSearchParams();
      if (input.companyCode) query.set("companyCode", input.companyCode);
      if (input.year) query.set("year", input.year);
      if (input.month) query.set("month", input.month);
      await downloadFinanceWorkbook(
        workspacePath(`/api/modules/finance/treasury/export?${query.toString()}`),
        input.fallbackFilename,
        "利息底稿 Excel 下载失败",
      );
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "利息底稿 Excel 下载失败");
    } finally {
      setDownloading(false);
    }
  }, [downloading, feedback, input]);

  if (!input.canExport) return null;
  return {
    kind: "action-group",
    key: "treasury-interest-excel-export",
    actions: [{
      key: "export",
      kind: "download",
      label: downloading ? "下载中" : "下载Excel",
      disabled: Boolean(input.disabled) || downloading,
      onClick: () => void download(),
    }],
  };
}
