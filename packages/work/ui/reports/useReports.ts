"use client";

import { useState, useEffect, useCallback } from "react";
import { getPeriodRange, getPeriodTypeName } from "@workspace/core/period";
import { workspacePath } from "@workspace/core/routing";
import type { PeriodType } from "@workspace/core/period";
import type { SavedTarget } from "./hooks/useReportAuth";
import { useReportAuth, loadSavedTarget, saveTarget } from "./hooks/useReportAuth";
import { useReportPeriod } from "./hooks/useReportPeriod";
import { useReportLoader } from "./hooks/useReportLoader";
import type { ItemRow } from "./WorkSection";

export function useReports(showToast: (message: string, type?: "success" | "error") => void) {
  const auth = useReportAuth();
  const period = useReportPeriod();
  const loader = useReportLoader();
  const { fetchUser, setInitialLoading } = auth;

  const [targetType, setTargetType] = useState("department");
  const [targetId, setTargetId] = useState(0);
  const [targetName, setTargetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRoutineSelect, setShowRoutineSelect] = useState(false);
  const [showNonRoutineSelect, setShowNonRoutineSelect] = useState(false);

  // Initialize user, period, target, and load initial report
  const init = useCallback(async () => {
    const user = await fetchUser();
    if (!user) return;

    const savedTarget = loadSavedTarget();
    if (savedTarget) {
      setTargetType(savedTarget.targetType);
      setTargetId(savedTarget.targetId);
      setTargetName(savedTarget.targetName);
    }

    await loader.loadReport(user, period.periodType, period.selectedYear, period.selectedPeriodIndex, savedTarget?.targetType || "department", savedTarget?.targetId || 0);
    setInitialLoading(false);
  }, [fetchUser, setInitialLoading, loader, period.periodType, period.selectedYear, period.selectedPeriodIndex]);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when period or target changes
  useEffect(() => {
    if (!auth.user) return;
    loader.loadReport(auth.user, period.periodType, period.selectedYear, period.selectedPeriodIndex, targetType, targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, period.periodType, period.selectedYear, period.selectedPeriodIndex, targetType, targetId]);

  const handlePeriodTypeChange = useCallback((pt: PeriodType) => {
    const { year, periodIndex } = period.handlePeriodTypeChange(pt);
    if (auth.user) {
      loader.loadReport(auth.user, pt, year, periodIndex, targetType, targetId);
    }
  }, [auth.user, period, targetType, targetId, loader]);

  const handleYearChange = useCallback((year: number) => {
    const { periodIndex } = period.handleYearChange(year);
    if (auth.user) {
      loader.loadReport(auth.user, period.periodType, year, periodIndex, targetType, targetId);
    }
  }, [auth.user, period, targetType, targetId, loader]);

  const handlePeriodIndexChange = useCallback((index: number) => {
    const { year } = period.handlePeriodIndexChange(index);
    if (auth.user) {
      loader.loadReport(auth.user, period.periodType, year, index, targetType, targetId);
    }
  }, [auth.user, period, targetType, targetId, loader]);

  const handleTargetChange = useCallback((target: SavedTarget | null) => {
    saveTarget(target);
    if (target) {
      setTargetType(target.targetType);
      setTargetId(target.targetId);
      setTargetName(target.targetName);
      loader.setTaskName(target.targetName);
    } else {
      setTargetType("department");
      setTargetId(0);
      setTargetName("");
      loader.setTaskName("");
    }
    if (auth.user) {
      loader.loadReport(auth.user, period.periodType, period.selectedYear, period.selectedPeriodIndex, target?.targetType || "department", target?.targetId || 0);
    }
  }, [auth.user, period, loader]);

  async function handleLoadVersion(version: number) {
    if (!loader.report) return;
    loader.setViewingVersion(version);
    if (version === 0) {
      if (auth.user) {
        await loader.loadReport(auth.user, period.periodType, period.selectedYear, period.selectedPeriodIndex, targetType, targetId);
      }
      return;
    }
    await loader.loadVersion(loader.report.id, version);
  }

  async function handleSubmit() {
    setSaving(true);
    if (!targetId && !loader.report) {
      showToast("请先选择汇报对象", "error");
      setSaving(false);
      return;
    }

    const items = [
      ...loader.routineItems.map((it, i) => ({ category: "routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
      ...loader.nonRoutineItems.map((it, i) => ({ category: "non-routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
    ];

    const pInfo = getPeriodRange(period.periodType, period.selectedYear, period.selectedPeriodIndex);
    const autoTaskName = targetName ? `${targetName}${pInfo.label}${getPeriodTypeName(period.periodType)}` : loader.taskName;
    const body = loader.report
      ? { taskName: autoTaskName, notes: loader.notes, items }
      : { taskName: autoTaskName, notes: loader.notes, items, date: pInfo.date, targetType, targetId };

    const res = await fetch(workspacePath(loader.report ? `/api/modules/work/reports/${loader.report.id}` : "/api/modules/work/reports"), {
      method: loader.report ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      showToast(loader.report ? "更新成功" : "提交成功", "success");
      const d = await res.json();
      if (d.report) {
        loader.setReport(d.report);
        if (loader.report) {
          const vRes = await fetch(workspacePath(`/api/modules/work/reports/${loader.report.id}/versions`));
          const vData = await vRes.json();
          loader.setVersions(vData.history || []);
        }
      }
    } else {
      const err = await res.json();
      showToast(err.error || "操作失败", "error");
    }
    setSaving(false);
  }

  // Item manipulation helpers
  const itemOps = {
    update(items: ItemRow[], setItems: (v: ItemRow[]) => void) {
      return (index: number, field: keyof ItemRow, value: string) => {
        const next = [...items];
        next[index] = { ...next[index], [field]: value };
        setItems(next);
      };
    },
    remove(items: ItemRow[], setItems: (v: ItemRow[]) => void) {
      return (index: number) => setItems(items.filter((_, i) => i !== index));
    },
    move(items: ItemRow[], setItems: (v: ItemRow[]) => void) {
      return (index: number, direction: number) => {
        const target = index + direction;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        setItems(next);
      };
    },
    import(items: ItemRow[], setItems: (v: ItemRow[]) => void, setShow: (v: boolean) => void) {
      return (content: string) => {
        if (!content) return;
        const w = loader.workList.find((x) => x.content === content);
        setItems([...items, { plan: content, completion: "", nextGoal: "", workId: w?.id, isNew: true }]);
        setShow(false);
      };
    },
  };

  return {
    user: auth.user,
    initialLoading: auth.initialLoading,
    loading: false,
    saving,
    viewingVersion: loader.viewingVersion,
    report: loader.report,
    taskName: loader.taskName,
    notes: loader.notes,
    setNotes: loader.setNotes,
    targetType,
    targetId,
    targetName,
    periodType: period.periodType,
    routineItems: loader.routineItems,
    nonRoutineItems: loader.nonRoutineItems,
    showRoutineSelect,
    setShowRoutineSelect,
    showNonRoutineSelect,
    setShowNonRoutineSelect,
    workList: loader.workList,
    periodInfo: loader.periodInfo,
    versions: loader.versions,
    selectedYear: period.selectedYear,
    selectedPeriodIndex: period.selectedPeriodIndex,
    yearOptions: period.yearOptions,
    periodOptions: period.periodOptions,
    periodTypeName: period.periodTypeName,
    handlePeriodTypeChange,
    handleYearChange,
    handlePeriodIndexChange,
    handleTargetChange,
    handleSubmit,
    loadVersion: handleLoadVersion,
    onUpdateRoutine: itemOps.update(loader.routineItems, loader.setRoutineItems),
    onRemoveRoutine: itemOps.remove(loader.routineItems, loader.setRoutineItems),
    onMoveRoutine: itemOps.move(loader.routineItems, loader.setRoutineItems),
    onImportRoutine: itemOps.import(loader.routineItems, loader.setRoutineItems, setShowRoutineSelect),
    onUpdateNonRoutine: itemOps.update(loader.nonRoutineItems, loader.setNonRoutineItems),
    onRemoveNonRoutine: itemOps.remove(loader.nonRoutineItems, loader.setNonRoutineItems),
    onMoveNonRoutine: itemOps.move(loader.nonRoutineItems, loader.setNonRoutineItems),
    onImportNonRoutine: itemOps.import(loader.nonRoutineItems, loader.setNonRoutineItems, setShowNonRoutineSelect),
  };
}
