"use client";

import { useState, useCallback, useEffect } from "react";
import { SessionUser } from "@/lib/types";
import ImportUploadForm from "./components/ImportUploadForm";
import ImportPreview from "./components/ImportPreview";
import ImportResult from "./components/ImportResult";
import { Company, PreviewResult } from "./components/types";

export default function ImportClient({ user: _user }: { user: SessionUser }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [importType, setImportType] = useState<"balance" | "journal" | "account">("balance");
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetch("/workspace/api/hr/companies")
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
      const res = await fetch("/workspace/api/finance/import/preview", {
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
      const res = await fetch("/workspace/api/finance/import/confirm", {
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
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ImportUploadForm
        companies={companies}
        companyCode={companyCode}
        importType={importType}
        year={year}
        file={file}
        dragActive={dragActive}
        loading={loading}
        onCompanyChange={setCompanyCode}
        onTypeChange={handleTypeChange}
        onYearChange={setYear}
        onFileChange={handleFileChange}
        onDragStateChange={setDragActive}
        onPreview={handlePreview}
      />

      {result && (
        <ImportResult success={result.success} message={result.message} />
      )}

      {preview && (
        <ImportPreview
          preview={preview}
          importing={importing}
          typeLabel={typeLabel}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
