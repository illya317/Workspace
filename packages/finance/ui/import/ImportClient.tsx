"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback, useEffect, useMemo } from "react";
import type { SessionUser } from "@workspace/platform/types";
import { PageSurface, createPageBody, createPageTabBar } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { createImportUploadSections } from "./components/ImportUploadForm";
import { createImportPreviewSections } from "./components/ImportPreview";
import { createImportResultSection } from "./components/ImportResult";
import type { Company, ImportType, PreviewResult } from "./components/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

export default function ImportClient({ user, canImport }: { user: SessionUser; canImport: boolean }) {
  const companyOptions = useCompanyOptions(false);
  const companies = useMemo<Company[]>(
    () => companyOptions.map((company) => ({ code: company.value, name: company.label })),
    [companyOptions],
  );
  const [companyCode, setCompanyCode] = useState("");
  const [importType, setImportType] = useState<ImportType>("balance");
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("import", user), [user]);
  const navigation = activeChildTabs.length > 1 ? createPageTabBar({
    items: activeChildTabs,
    active: activeChildTabs[0]?.key ?? "",
    onChange: () => {},
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("import");

  useEffect(() => {
    if (companies.length > 0) {
      setCompanyCode((previous) => previous || companies[0].code);
    }
  }, [companies]);

  const handleFileChange = useCallback((newFile: File | null) => {
    setFile(newFile);
    setPreview(null);
    setResult(null);
  }, []);

  const handleTypeChange = useCallback((type: ImportType) => {
    setImportType(type);
    setPreview(null);
    setFile(null);
    setResult(null);
  }, []);

  async function handlePreview() {
    if (!file || !companyCode) return;
    setLoading(true);
    setPreview(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);
    formData.append("companyCode", companyCode);
    formData.append("year", year);

    try {
      const res = await fetch(workspacePath("/api/modules/finance/import/preview"), {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview);
      } else {
        setResult({ success: false, message: data.error || "预览失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    if (!canImport) {
      setResult({ success: false, message: "无确认导入权限" });
      return;
    }
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch(workspacePath("/api/modules/finance/import/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview }),
      });
      const data = await res.json();
      if (data.success) {
        const balanceMode =
          preview.type === "balance"
            ? data.mode === "baseline"
              ? "年度余额基准"
              : "年度余额校准快照"
            : preview.type === "auxiliary"
              ? "辅助余额重分类"
              : null;
        setResult({
          success: true,
          message: `导入成功：${Number(data.created ?? 0) + Number(data.updated ?? 0)} 条${balanceMode || (preview.type === "account" ? "科目" : "凭证")}数据已写入`,
        });
        setPreview(null);
        setFile(null);
      } else {
        setResult({ success: false, message: data.error || "导入失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setImporting(false);
    }
  }

  const typeLabel =
    importType === "balance" ? "余额表" :
    importType === "journal" ? "序时账" :
    importType === "auxiliary" ? "辅助余额表" : "科目表";

  return (
    <PageSurface kind="standard"
      tabbar={navigation}
      body={createPageBody([
          ...lifecycleBlocks,
          ...createImportUploadSections({
            companies,
            companyCode,
            importType,
            year,
            file,
            loading,
            onCompanyChange: setCompanyCode,
            onTypeChange: handleTypeChange,
            onYearChange: setYear,
            onFileChange: handleFileChange,
            onPreview: handlePreview,
          }),
          ...(result ? [createImportResultSection({ success: result.success, message: result.message })] : []),
          ...(preview ? createImportPreviewSections({ preview, importing, typeLabel, canImport, onConfirm: handleConfirm }) : []),
        ])}
    />
  );
}
