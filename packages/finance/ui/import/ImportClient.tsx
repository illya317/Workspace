"use client";

import { workspacePath } from "@workspace/core/routing";
import { useState, useCallback, useEffect, useMemo } from "react";
import { SessionUser } from "@workspace/platform/types";
import { PageSurface, createPageBody, createPageTabsNavigation } from "@workspace/core/ui";
import { createImportUploadSections } from "./components/ImportUploadForm";
import { createImportPreviewSections } from "./components/ImportPreview";
import { createImportResultSection } from "./components/ImportResult";
import { Company, PreviewResult } from "./components/types";
import { getFinanceLifecycleBlocks, getFinancePageViewTabs } from "../components/finance-page-spec";

export default function ImportClient({ user }: { user: SessionUser }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [importType, setImportType] = useState<"balance" | "journal" | "account">("balance");
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const activeChildTabs = useMemo(() => getFinancePageViewTabs("import", user), [user]);
  const navigation = activeChildTabs.length > 1 ? createPageTabsNavigation({
    items: activeChildTabs,
    active: activeChildTabs[0]?.key ?? "",
    onChange: () => {},
  }) : undefined;
  const lifecycleBlocks = getFinanceLifecycleBlocks("import");

  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies"))
      .then((r) => r.json())
      .then((data) => {
        const list = (data.companies || []) as Company[];
        setCompanies(list);
        if (list.length > 0) {
          setCompanyCode((prev) => prev || list[0].code);
        }
      })
      .catch(() => {
        setResult({ success: false, message: "加载公司列表失败" });
      });
  }, []);

  const handleFileChange = useCallback((newFile: File | null) => {
    setFile(newFile);
    setPreview(null);
    setResult(null);
  }, []);

  const handleTypeChange = useCallback((type: "balance" | "journal" | "account") => {
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
            : null;
        setResult({
          success: true,
          message: `导入成功：${data.imported} 条${balanceMode || (preview.type === "account" ? "科目" : "凭证")}数据已写入`,
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
    importType === "journal" ? "序时账" : "科目表";

  return (
    <PageSurface kind="standard"
      navigation={navigation}
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
          ...(preview ? createImportPreviewSections({ preview, importing, typeLabel, onConfirm: handleConfirm }) : []),
        ])}
    />
  );
}
