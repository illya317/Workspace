"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildTargetPreviewQuery,
  confirmedMappingForTarget,
  deriveComparisonUiState,
  EMPTY_COMPARISON_LINE_FILTER,
  filterComparisonLines,
  isComparisonMappingStale,
  resolveComparisonLineMapping,
  selectableComparisonPackages,
  selectionFromLaunchContext,
  validateComparisonUploadFile,
  type ComparisonLineFilter,
  type ComparisonMappingChoices,
  type ComparisonTargetSelection,
} from "./statement-comparison-model";
import {
  parseComparisonRunLine,
  type ComparisonMappingItemDto,
  type ComparisonPackageDetailDto,
  type ComparisonPackageListItemDto,
  type ComparisonRunDetailDto,
  type ComparisonTargetPreviewDto,
  type ComparisonUploadResultDto,
} from "./statement-comparison-types";
import type { StatementComparisonLaunchContext } from "./statement-ui-types";

/**
 * 差异诊断数据 hook（Package 7）。
 * stale 防护：每类请求记录最新请求序号/身份，过期响应一律丢弃；
 * 目标/证据包/运行选择变化立即使旧请求失效（不覆盖更新的选择）。
 */

interface BatchOption {
  value: string;
  label: string;
}

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error((payload as { error?: string } | null)?.error || `${fallback}（${response.status}）`);
  }
  if (payload === null) throw new Error(`${fallback}：空响应`);
  return payload;
}

export function useStatementComparison() {
  // ─── 目标选择 ───
  const [targetKind, setTargetKind] = useState<"entity" | "consolidated">("entity");
  const [companyCode, setCompanyCode] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [periodKind, setPeriodKind] = useState<"monthly" | "cumulative">("cumulative");
  const [reportType, setReportType] = useState<"balance" | "income" | "cashflow">("balance");
  const [batchId, setBatchId] = useState<number | null>(null);
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [preview, setPreview] = useState<ComparisonTargetPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ─── 证据包 ───
  const [packages, setPackages] = useState<ComparisonPackageListItemDto[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [packageDetail, setPackageDetail] = useState<ComparisonPackageDetailDto | null>(null);
  const [packageDetailLoading, setPackageDetailLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ─── 映射 ───
  const [selectedProposalIndex, setSelectedProposalIndex] = useState<number | null>(null);
  const [mappingChoices, setMappingChoices] = useState<ComparisonMappingChoices>({});
  const [remapMode, setRemapMode] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // ─── 运行 ───
  const [runDetail, setRunDetail] = useState<ComparisonRunDetailDto | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // ─── 过滤与行选中 ───
  const [filter, setFilter] = useState<ComparisonLineFilter>(EMPTY_COMPARISON_LINE_FILTER);
  const [selectedLineCode, setSelectedLineCode] = useState<string | null>(null);

  // stale 防护：每类资源的最新请求序号。
  const previewSeqRef = useRef(0);
  const packagesSeqRef = useRef(0);
  const detailSeqRef = useRef(0);
  const runSeqRef = useRef(0);
  const uploadAbortRef = useRef<AbortController | null>(null);

  const selection = useMemo<ComparisonTargetSelection | null>(() => {
    if (targetKind === "entity") {
      const parsedYear = Number(year);
      const parsedMonth = Number(month);
      if (!companyCode || !Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth)) return null;
      return { kind: "entity", companyCode, year: parsedYear, month: parsedMonth, periodKind, reportType };
    }
    if (batchId === null) return null;
    return { kind: "consolidated", batchId, reportType };
  }, [batchId, companyCode, month, periodKind, reportType, targetKind, year]);

  const resetEvidence = useCallback(() => {
    // 目标变化：证据包/映射/运行选择全部失效，过期响应不得覆盖。
    detailSeqRef.current += 1;
    runSeqRef.current += 1;
    uploadAbortRef.current?.abort();
    setSelectedPackageId(null);
    setPackageDetail(null);
    setRunDetail(null);
    setSelectedLineCode(null);
    setSelectedProposalIndex(null);
    setMappingChoices({});
    setRemapMode(false);
    setUploadError(null);
    setUploadFile(null);
    setFilter(EMPTY_COMPARISON_LINE_FILTER);
  }, []);

  const clearPreview = useCallback(() => {
    previewSeqRef.current += 1;
    setPreview(null);
    setPreviewError(null);
    resetEvidence();
  }, [resetEvidence]);

  const runPreviewFor = useCallback(async (target: ComparisonTargetSelection) => {
    const seq = ++previewSeqRef.current;
    resetEvidence();
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await readApi<ComparisonTargetPreviewDto>(
        await fetch(workspacePath(`/api/modules/finance/statements/comparisons/target-preview?${buildTargetPreviewQuery(target)}`)),
        "对比目标预览失败",
      );
      if (seq !== previewSeqRef.current) return;
      setPreview(result);
    } catch (cause) {
      if (seq !== previewSeqRef.current) return;
      setPreview(null);
      setPreviewError(cause instanceof Error ? cause.message : "对比目标预览失败");
    } finally {
      if (seq === previewSeqRef.current) setPreviewLoading(false);
    }
  }, [resetEvidence]);

  const runPreview = useCallback(async () => {
    if (!selection) return;
    await runPreviewFor(selection);
  }, [runPreviewFor, selection]);

  // ─── 合并批次选项（手动选择路径）───
  useEffect(() => {
    if (targetKind !== "consolidated") {
      setBatchOptions([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ year, month });
    fetch(workspacePath(`/api/modules/finance/statements/consolidation?${params}`), { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          batchVersions?: { id: number; version: number; status: string }[];
        } | null;
        if (controller.signal.aborted || !payload?.batchVersions) return;
        setBatchOptions(payload.batchVersions.map((batch) => ({
          value: String(batch.id),
          label: `批次 #${batch.id}（V${batch.version} · ${batch.status}）`,
        })));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [month, targetKind, year]);

  // ─── 证据包列表 ───
  const refreshPackages = useCallback(async () => {
    const seq = ++packagesSeqRef.current;
    setPackagesLoading(true);
    try {
      const result = await readApi<ComparisonPackageListItemDto[]>(
        await fetch(workspacePath("/api/modules/finance/statements/comparisons")),
        "对比证据列表读取失败",
      );
      if (seq !== packagesSeqRef.current) return;
      setPackages(result);
    } catch {
      if (seq !== packagesSeqRef.current) return;
      setPackages([]);
    } finally {
      if (seq === packagesSeqRef.current) setPackagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPackages();
  }, [refreshPackages]);

  // ─── 证据包详情 ───
  const selectPackage = useCallback(async (packageId: number) => {
    const seq = ++detailSeqRef.current;
    runSeqRef.current += 1;
    setSelectedPackageId(packageId);
    setRunDetail(null);
    setSelectedLineCode(null);
    setRemapMode(false);
    setPackageDetailLoading(true);
    try {
      const result = await readApi<ComparisonPackageDetailDto>(
        await fetch(workspacePath(`/api/modules/finance/statements/comparisons/${packageId}`)),
        "对比证据详情读取失败",
      );
      if (seq !== detailSeqRef.current) return;
      setPackageDetail(result);
      const proposals = result.detection?.proposals ?? [];
      const bestIndex = result.detection?.best ? proposals.indexOf(result.detection.best) : -1;
      setSelectedProposalIndex(bestIndex >= 0 ? bestIndex : proposals.length > 0 ? 0 : null);
      setMappingChoices({});
    } catch {
      if (seq !== detailSeqRef.current) return;
      setPackageDetail(null);
    } finally {
      if (seq === detailSeqRef.current) setPackageDetailLoading(false);
    }
  }, []);

  // ─── 上传 ───
  const upload = useCallback(async () => {
    const validationError = validateComparisonUploadFile(uploadFile);
    if (validationError) {
      setUploadError(validationError);
      return;
    }
    if (!uploadFile) return;
    const controller = new AbortController();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = controller;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      const result = await readApi<ComparisonUploadResultDto>(
        await fetch(workspacePath("/api/modules/finance/statements/comparisons"), {
          method: "POST",
          body: form,
          signal: controller.signal,
        }),
        "对比证据上传失败",
      );
      setUploadFile(null);
      void refreshPackages();
      await selectPackage(result.packageId);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setUploadError(cause instanceof Error ? cause.message : "对比证据上传失败");
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  }, [refreshPackages, selectPackage, uploadFile]);

  const cancelUploadWait = useCallback(() => {
    uploadAbortRef.current?.abort();
    setUploading(false);
  }, []);

  // ─── 映射确认/重确认 ───
  const activeMapping = useMemo<ComparisonMappingItemDto | null>(
    () => confirmedMappingForTarget(packageDetail, preview),
    [packageDetail, preview],
  );
  const staleMapping = useMemo(
    () => isComparisonMappingStale(activeMapping, preview),
    [activeMapping, preview],
  );

  // ─── 运行 ───
  const loadRun = useCallback(async (runId: number) => {
    const seq = ++runSeqRef.current;
    setRunLoading(true);
    try {
      const result = await readApi<ComparisonRunDetailDto>(
        await fetch(workspacePath(`/api/modules/finance/statements/comparisons/runs/${runId}`)),
        "对比运行读取失败",
      );
      if (seq !== runSeqRef.current) return;
      setRunDetail({ ...result, lines: result.lines.map(parseComparisonRunLine) });
      setSelectedLineCode(null);
      setFilter(EMPTY_COMPARISON_LINE_FILTER);
    } catch {
      if (seq !== runSeqRef.current) return;
      setRunDetail(null);
    } finally {
      if (seq === runSeqRef.current) setRunLoading(false);
    }
  }, []);

  const startRunForMapping = useCallback(async (mappingId: number) => {
    const result = await readApi<{ runId: number }>(
      await fetch(workspacePath(`/api/modules/finance/statements/comparisons/${mappingId}/runs`), {
        method: "POST",
      }),
      "对比启动失败",
    );
    if (selectedPackageId !== null) await selectPackage(selectedPackageId);
    await loadRun(result.runId);
  }, [loadRun, selectPackage, selectedPackageId]);

  // 保存 Excel 报表对应关系后可直接开始对比，不向用户暴露两个后端步骤。
  const confirmMapping = useCallback(async (startRun = false) => {
    if (!packageDetail || selectedProposalIndex === null) return;
    const proposal = packageDetail.detection?.proposals[selectedProposalIndex];
    if (!proposal) return;
    setConfirming(true);
    if (startRun) setCreatingRun(true);
    try {
      const remap = remapMode && activeMapping;
      const body: Record<string, unknown> = {
        structureMapping: proposal.structure,
        lineMapping: resolveComparisonLineMapping(proposal.lines, mappingChoices),
      };
      if (remap) {
        body.mappingId = activeMapping.id;
        body.expectedRevision = activeMapping.revision;
      } else {
        if (!preview) return;
        body.target = preview.target;
      }
      const saved = await readApi<{ mappingId: number }>(
        await fetch(workspacePath(`/api/modules/finance/statements/comparisons/${packageDetail.id}/mapping`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        "Excel 报表确认失败",
      );
      setRemapMode(false);
      if (startRun) {
        await startRunForMapping(saved.mappingId);
      } else {
        await selectPackage(packageDetail.id);
      }
    } finally {
      setConfirming(false);
      if (startRun) setCreatingRun(false);
    }
  }, [activeMapping, mappingChoices, packageDetail, preview, remapMode, selectPackage, selectedProposalIndex, startRunForMapping]);

  const createRun = useCallback(async () => {
    if (!activeMapping || staleMapping) return;
    setCreatingRun(true);
    try {
      await startRunForMapping(activeMapping.id);
    } finally {
      setCreatingRun(false);
    }
  }, [activeMapping, staleMapping, startRunForMapping]);

  const closeRun = useCallback(() => {
    runSeqRef.current += 1;
    setRunDetail(null);
    setSelectedLineCode(null);
    setFilter(EMPTY_COMPARISON_LINE_FILTER);
  }, []);

  // ─── 归档 ───
  const archivePackage = useCallback(async () => {
    if (selectedPackageId === null) return;
    setArchiving(true);
    try {
      await readApi(
        await fetch(workspacePath(`/api/modules/finance/statements/comparisons/${selectedPackageId}/archive`), {
          method: "POST",
        }),
        "对比证据归档失败",
      );
      detailSeqRef.current += 1;
      setSelectedPackageId(null);
      setPackageDetail(null);
      setRunDetail(null);
      void refreshPackages();
    } finally {
      setArchiving(false);
    }
  }, [refreshPackages, selectedPackageId]);

  // ─── context-launch 预填（立即解析系统目标，不依赖 render 时序）───
  const applyLaunchContext = useCallback((context: StatementComparisonLaunchContext) => {
    clearPreview();
    if (context.kind === "entity") {
      setTargetKind("entity");
      setCompanyCode(context.companyCode);
      setYear(String(context.year));
      setMonth(String(context.month));
      setPeriodKind(context.periodKind);
      setReportType(context.reportType);
    } else {
      setTargetKind("consolidated");
      setBatchId(context.batchId);
      setBatchOptions((current) => (
        current.some((option) => option.value === String(context.batchId))
          ? current
          : [{ value: String(context.batchId), label: context.batchLabel }, ...current]
      ));
      setReportType(context.reportType);
    }
    void runPreviewFor(selectionFromLaunchContext(context));
  }, [clearPreview, runPreviewFor]);

  // ─── 派生 ───
  const filteredLines = useMemo(
    () => (runDetail ? filterComparisonLines(runDetail.lines, filter) : []),
    [filter, runDetail],
  );
  const uiState = useMemo(() => deriveComparisonUiState({
    preview,
    uploading,
    uploadError,
    packageDetail,
    runDetail,
  }), [packageDetail, preview, runDetail, uploadError, uploading]);

  return {
    targetKind,
    setTargetKind: (kind: "entity" | "consolidated") => {
      clearPreview();
      setTargetKind(kind);
    },
    selection,
    companyCode,
    setCompanyCode: (value: string) => { clearPreview(); setCompanyCode(value); },
    year,
    setYear: (value: string) => { clearPreview(); setYear(value); },
    month,
    setMonth: (value: string) => { clearPreview(); setMonth(value); },
    periodKind,
    setPeriodKind: (value: "monthly" | "cumulative") => { clearPreview(); setPeriodKind(value); },
    reportType,
    setReportType: (value: "balance" | "income" | "cashflow") => { clearPreview(); setReportType(value); },
    batchId,
    setBatchId: (value: number | null) => { clearPreview(); setBatchId(value); },
    batchOptions,
    preview,
    previewLoading,
    previewError,
    runPreview,
    packages: selectableComparisonPackages(packages),
    packagesLoading,
    refreshPackages,
    selectedPackageId,
    packageDetail,
    packageDetailLoading,
    selectPackage,
    uploadFile,
    setUploadFile,
    uploading,
    uploadError,
    upload,
    cancelUploadWait,
    selectedProposalIndex,
    setSelectedProposalIndex,
    mappingChoices,
    chooseMapping: (row: number, choice: string) => setMappingChoices((current) => ({ ...current, [row]: choice })),
    remapMode,
    startRemap: () => setRemapMode(true),
    confirming,
    confirmMapping,
    activeMapping,
    staleMapping,
    runDetail,
    runLoading,
    creatingRun,
    createRun,
    closeRun,
    loadRun,
    archiving,
    archivePackage,
    applyLaunchContext,
    filter,
    setFilter,
    filteredLines,
    selectedLineCode,
    setSelectedLineCode,
    uiState,
  };
}

export type StatementComparisonController = ReturnType<typeof useStatementComparison>;
