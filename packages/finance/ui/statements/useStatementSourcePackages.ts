"use client";

import {
  createFormSection,
  createMessageSection,
  createPageTableSection,
  useFeedback,
  type BodySurfaceSectionSpec,
  type DataSurfaceColumnSpec,
  type DataSurfaceRowActionSpec,
  type FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import type {
  ConsolidationOverview,
  StatementSourcePackageSnapshot,
} from "@workspace/finance/types";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ConsolidationCapabilities } from "./statement-ui-types";

interface SourcePackageWorkspaceInput {
  active: boolean;
  capabilities: ConsolidationCapabilities;
  data: ConsolidationOverview | null;
  onConsolidationRefresh: () => void;
}

function apiError(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallback;
}

function packageColumns(): DataSurfaceColumnSpec<StatementSourcePackageSnapshot>[] {
  return [
    { key: "revision", label: "版本", required: true, width: "xs", cell: (row) => `v${row.revision}` },
    { key: "file", label: "来源文件", required: true, width: "xl", cell: (row) => ({ kind: "stack", gap: "xs", items: [
      { kind: "text", value: row.fileName, emphasis: "medium", wrap: "wrap" },
      { kind: "text", value: `${(row.fileSize / 1024).toFixed(1)} KB · SHA256 ${row.fileChecksum.slice(0, 12)}`, tone: "muted" },
    ] }) },
    { key: "company", label: "编制单位", width: "lg", cell: (row) => `${row.companyName} · 文件识别：${row.parsedCompanyName}` },
    { key: "sheets", label: "三表解析", width: "lg", cell: (row) => row.sheets.map((sheet) => `${sheet.reportType} ${sheet.lineCount}行`).join(" · ") },
    { key: "status", label: "状态", required: true, width: "sm", cell: (row) => ({
      kind: "badge",
      label: row.status === "submitted" ? "已提交" : row.status === "rejected" ? "已驳回" : "待提交",
      tone: row.status === "submitted" ? "green" : row.status === "rejected" ? "red" : "amber",
    }) },
    { key: "note", label: "说明", width: "xl", cell: (row) => row.rejectionReason || row.note || "—" },
  ];
}

export function useStatementSourcePackages({
  active,
  capabilities,
  data,
  onConsolidationRefresh,
}: SourcePackageWorkspaceInput) {
  const feedback = useFeedback();
  const [companyCode, setCompanyCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<StatementSourcePackageSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const scope = data?.scope;
  const companyOptions = useMemo(
    () => data?.entities.map((entity) => ({ value: entity.code, label: `${entity.code} ${entity.name}` })) ?? [],
    [data?.entities],
  );

  useEffect(() => {
    if (companyOptions.length === 0) return;
    if (!companyOptions.some((option) => option.value === companyCode)) {
      setCompanyCode(companyOptions[0]!.value);
    }
  }, [companyCode, companyOptions]);

  const load = useCallback(async () => {
    if (!active || !companyCode || !scope) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyCode,
        year: String(scope.year),
        month: String(scope.month),
      });
      const response = await fetch(workspacePath(`/api/modules/finance/statements/consolidation/source-packages?${params}`));
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "三表来源包读取失败"));
      setRows((payload?.sourcePackages ?? []) as StatementSourcePackageSnapshot[]);
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "三表来源包读取失败");
    } finally {
      setLoading(false);
    }
  }, [active, companyCode, feedback, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload() {
    if (!file || !companyCode || !scope) return;
    setLoading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("companyCode", companyCode);
      body.set("year", String(scope.year));
      body.set("month", String(scope.month));
      if (note.trim()) body.set("note", note.trim());
      const response = await fetch(workspacePath("/api/modules/finance/statements/consolidation/source-packages"), {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "三表来源包上传失败"));
      feedback.success("三表已解析为来源包草稿，请核对后提交");
      setFile(null);
      setNote("");
      await load();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "三表来源包上传失败");
    } finally {
      setLoading(false);
    }
  }

  async function submit(row: StatementSourcePackageSnapshot) {
    setLoading(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/finance/statements/consolidation/source-packages/${row.id}/submit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: row.version, note: row.note }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "三表来源包提交失败"));
      feedback.success("三表来源包已提交，并生成可被报表消费的 submitted workpaper");
      await load();
      onConsolidationRefresh();
    } catch (cause) {
      feedback.error(cause instanceof Error ? cause.message : "三表来源包提交失败");
    } finally {
      setLoading(false);
    }
  }

  const fields: FormSurfaceFieldSpec[] = [
    {
      key: "companyCode",
      label: "编制单位",
      required: true,
      spec: { valueType: "string", control: "choice", options: { source: "static", items: companyOptions } },
      value: companyCode,
      onChange: (value) => setCompanyCode(String(value ?? "")),
    },
    {
      key: "file",
      label: "法定三表 Excel",
      required: true,
      spec: { valueType: "file", control: "file" },
      accept: ".xls,.xlsx",
      onChange: (value) => setFile(value instanceof File ? value : null),
    },
    {
      key: "note",
      label: "来源说明",
      spec: { valueType: "string", control: "text" },
      value: note,
      onChange: (value) => setNote(String(value ?? "")),
      placeholder: "例如：经财务负责人核对的 2026 年末法定三表",
    },
  ];
  const columns = packageColumns();
  const rowActions = (row: StatementSourcePackageSnapshot): DataSurfaceRowActionSpec[] => row.status === "draft"
    ? [{
        key: "submit",
        kind: "save",
        label: "提交三表",
        disabled: loading || !capabilities.canSubmit,
        onClick: () => void submit(row),
      }]
    : [];

  return {
    sections: [
      createMessageSection("statement-source-package-rule", {
        tone: "muted",
        content: "上传先形成不可变来源包草稿，服务端保存原文件、SHA256 和解析行；人工提交后才生成 submitted workpaper。草稿不会进入财务报表或合并批次。",
      }),
      createFormSection("statement-source-package-upload", {
        kind: "filters",
        header: { title: "补齐个别三表来源", description: scope ? `${scope.year}年${scope.month}月 · 文件内编制单位和年度会在服务端复核` : undefined },
        content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
        actions: [{
          key: "upload",
          action: "upload",
          label: loading ? "正在处理…" : "上传并解析",
          disabled: loading || !file || !companyCode || !capabilities.canCreate,
          onClick: () => void upload(),
        }],
      }),
      createPageTableSection("statement-source-package-history", {
        rows,
        columns,
        visibleColumns: columns.map((column) => column.key),
        rowKey: (row) => row.id,
        rowActions,
        actionsColumn: { label: "处理" },
        presentation: { density: "compact", cellWrap: "wrap" },
        scroll: { x: true },
        emptyText: loading ? "正在读取来源包…" : "当前公司和期间尚未上传三表来源包",
      }),
    ] satisfies BodySurfaceSectionSpec[],
  };
}
