"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import NavLink from "@/app/components/NavLink";
import TargetSwitcher from "@/app/components/TargetSwitcher";
import { getCurrentPeriod, getPeriodRange, getPreviousPeriod, getPeriodOptions, getYearOptions, getPeriodTypeName } from "@/lib/period";
import type { PeriodType } from "@/lib/period";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import ReportEditor, { type Report } from "./ReportEditor";
import type { ItemRow } from "./WorkSection";

export default function ReportPage() {
  const router = useRouter();
  const { toast, showToast, closeToast } = useToast();

  const [user, setUser] = useState<{ id: number; name: string; departmentId: number } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingVersion, setViewingVersion] = useState(0);

  const [report, setReport] = useState<Report | null>(null);
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [targetType, setTargetType] = useState("department");
  const [targetId, setTargetId] = useState(0);
  const [targetName, setTargetName] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");

  const [routineItems, setRoutineItems] = useState<ItemRow[]>([]);
  const [nonRoutineItems, setNonRoutineItems] = useState<ItemRow[]>([]);
  const [showRoutineSelect, setShowRoutineSelect] = useState(false);
  const [showNonRoutineSelect, setShowNonRoutineSelect] = useState(false);
  const [workList, setWorkList] = useState<Array<{ id: number; category: string; content: string }>>([]);

  const [periodInfo, setPeriodInfo] = useState<{ label: string; dateRange: string } | null>(null);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string }>>([]);
  const ci = getCurrentPeriod(periodType);
  const [selectedYear, setSelectedYear] = useState(ci.year);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(ci.periodIndex);

  const yearOptions = getYearOptions(periodType, ci.year);
  const periodOptions = getPeriodOptions(periodType, selectedYear);

  useEffect(() => { fetchUser(); }, []);

  async function fetchUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) { router.push("/login"); return; }
      const data = await res.json();
      setUser(data.user);

      // Load user period preference
      const savedPeriodType = typeof window !== "undefined" ? localStorage.getItem("selectedPeriodType") as PeriodType | null : null;
      if (savedPeriodType) setPeriodType(savedPeriodType);

      // Load saved target from localStorage
      const savedTT = typeof window !== "undefined" ? localStorage.getItem("selectedTargetType") : null;
      const savedTI = typeof window !== "undefined" ? localStorage.getItem("selectedTargetId") : null;
      const savedTN = typeof window !== "undefined" ? localStorage.getItem("selectedTargetName") : null;
      if (savedTT && savedTI) {
        setTargetType(savedTT);
        setTargetId(parseInt(savedTI));
        setTargetName(savedTN || "");
      }

      const info = getCurrentPeriod(periodType);
      setSelectedYear(info.year);
      setSelectedPeriodIndex(info.periodIndex);
      await loadReport(data.user, info.year, info.periodIndex, undefined, periodType);
    } catch { router.push("/login"); }
  }

  async function loadReport(u: { id: number; name: string; departmentId: number }, year: number, periodIndex: number, overrideTarget?: { targetType: string; targetId: number }, overridePeriodType?: PeriodType) {
    const pt = overridePeriodType || periodType;
    const range = getPeriodRange(pt, year, periodIndex);
    setPeriodInfo({ label: range.label, dateRange: range.dateRange });

    const tt = overrideTarget?.targetType || targetType || "department";
    const ti = overrideTarget?.targetId ?? targetId;
    const targetParam = tt && ti ? `&targetType=${tt}&targetIds=${ti}` : "";

    const date = range.date;
    const prev = getPreviousPeriod(pt, year, periodIndex);
    const prevDate = prev.date;

    const [reportsRes, prevRes, worksRes] = await Promise.all([
      fetch(`/api/reports?date=${date}${targetParam}`),
      fetch(`/api/reports?date=${prevDate}${targetParam}`),
      fetch(tt && ti ? `/api/works?targetType=${tt}&targetId=${ti}` : `/api/works?deptId=${u.departmentId}`),
    ]);

    const reportsData = await reportsRes.json();
    const prevData = await prevRes.json();
    const worksData = await worksRes.json();
    const works: Array<{ id: number; category: string; content: string }> = worksData.works || [];
    setWorkList(works);

    if (reportsData.reports?.length > 0) {
      const r = reportsData.reports[0];
      setReport(r);
      setTaskName(r.taskName);
      setNotes(r.notes || "");
      setViewingVersion(0);

      const vRes = await fetch(`/api/reports/${r.id}/versions`);
      const vData = await vRes.json();
      setVersions(vData.history || []);

      const mapItems = (cat: string) => r.items
        .filter((i: { category: string }) => i.category === cat)
        .sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)
        .map((i: { plan: string; completion: string; nextGoal: string; workItemId?: number | null }) => ({
          plan: i.plan, completion: i.completion || "", nextGoal: i.nextGoal || "",
          workId: i.workItemId ?? undefined, isImported: true,
        }));

      setRoutineItems(mapItems("routine"));
      setNonRoutineItems(mapItems("non-routine"));
    } else {
      setReport(null); setTaskName(""); setNotes(""); setVersions([]); setViewingVersion(0);
      const prevReport = prevData.reports?.[0];
      const prevItems: Array<{ category: string; plan: string; completion: string; nextGoal: string; workItemId?: number | null; sortOrder: number }> = prevReport?.items || [];

      const goalMap = new Map<number, string>();
      for (const item of prevItems) {
        if (item.workItemId && item.nextGoal) goalMap.set(item.workItemId, item.nextGoal);
      }

      function buildItems(cat: string) {
        const deptWorks = works.filter(w => w.category === cat);
        const prevCat = prevItems.filter(i => i.category === cat);
        if (deptWorks.length > 0) {
          return deptWorks.map(w => ({ plan: w.content, completion: "", nextGoal: "", workId: w.id, lastWeekGoal: goalMap.get(w.id) || "", isImported: true }));
        } else if (prevCat.length > 0) {
          return prevCat.map(i => ({ plan: i.nextGoal || i.plan, completion: "", nextGoal: "", workId: i.workItemId ?? undefined, lastWeekGoal: i.workItemId ? goalMap.get(i.workItemId) || "" : "", isImported: true }));
        }
        return [];
      }

      setRoutineItems(buildItems("routine"));
      setNonRoutineItems(buildItems("non-routine"));
    }
    setInitialLoading(false);
  }

  async function loadVersion(version: number) {
    if (!report) return;
    setViewingVersion(version);
    if (version === 0) { await loadReport(user!, selectedYear, selectedPeriodIndex, undefined, periodType); return; }
    const res = await fetch(`/api/reports/${report.id}/versions/${version}`);
    const data = await res.json();
    if (data.report) {
      const r = data.report;
      setTaskName(r.taskName);
      setNotes(r.notes || "");
      const map = (cat: string) => (r.items || []).filter((i: { category: string }) => i.category === cat).map((i: { plan: string; completion: string; nextGoal: string; workItemId?: number | null }) => ({
        plan: i.plan, completion: i.completion || "", nextGoal: i.nextGoal || "", workId: i.workItemId ?? undefined, isImported: true,
      }));
      setRoutineItems(map("routine"));
      setNonRoutineItems(map("non-routine"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (!targetId && !report) { showToast("请先选择汇报对象", "error"); setSaving(false); return; }

    const items = [
      ...routineItems.map((it, i) => ({ category: "routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
      ...nonRoutineItems.map((it, i) => ({ category: "non-routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
    ];

    const pInfo = getPeriodRange(periodType, selectedYear, selectedPeriodIndex);
    const autoTaskName = targetName ? `${targetName}${pInfo.label}${getPeriodTypeName(periodType)}` : taskName;
    const body = report
      ? { taskName: autoTaskName, notes, items }
      : { taskName: autoTaskName, notes, items, date: pInfo.date, targetType, targetId };

    const res = await fetch(report ? `/api/reports/${report.id}` : "/api/reports", {
      method: report ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      showToast(report ? "更新成功" : "提交成功", "success");
      const d = await res.json();
      if (d.report) {
        setReport(d.report);
        if (report) {
          const vRes = await fetch(`/api/reports/${report.id}/versions`);
          const vData = await vRes.json();
          setVersions(vData.history || []);
        }
      }
    } else {
      const err = await res.json();
      showToast(err.error || "操作失败", "error");
    }
    setSaving(false);
  }

  // Period change handlers (keep business logic in page)
  function handlePeriodTypeChange(pt: PeriodType) {
    setPeriodType(pt);
    localStorage.setItem("selectedPeriodType", pt);
    const info = getCurrentPeriod(pt);
    setSelectedYear(info.year);
    setSelectedPeriodIndex(info.periodIndex);
    if (user) loadReport(user, info.year, info.periodIndex, undefined, pt);
  }

  function handleYearChange(year: number) {
    setSelectedYear(year);
    const pi = periodType === "yearly" ? 1 : selectedPeriodIndex;
    if (user) loadReport(user, year, pi, undefined, periodType);
  }

  function handlePeriodIndexChange(index: number) {
    setSelectedPeriodIndex(index);
    if (user) loadReport(user, selectedYear, index, undefined, periodType);
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
        const w = workList.find(x => x.content === content);
        setItems([...items, { plan: content, completion: "", nextGoal: "", workId: w?.id, isNew: true }]);
        setShow(false);
      };
    },
  };

  if (initialLoading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  }

  const periodTypeName = getPeriodTypeName(periodType);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <TargetSwitcher
              value={targetId ? { targetType, targetId, targetName } : null}
              onChange={(target) => {
                if (target) {
                  localStorage.setItem("selectedTargetType", target.targetType);
                  localStorage.setItem("selectedTargetId", String(target.targetId));
                  localStorage.setItem("selectedTargetName", target.targetName);
                  setTargetType(target.targetType);
                  setTargetId(target.targetId);
                  setTargetName(target.targetName);
                  setTaskName(target.targetName);
                } else {
                  localStorage.removeItem("selectedTargetType");
                  localStorage.removeItem("selectedTargetId");
                  localStorage.removeItem("selectedTargetName");
                  setTargetName("");
                  setTaskName("");
                }
                if (user) loadReport(user, selectedYear, selectedPeriodIndex,
                  target ? { targetType: target.targetType, targetId: target.targetId } : undefined, periodType);
              }}
            />
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => router.push("/portal")} className="text-sm text-gray-500 hover:text-emerald-600">返回入口</button>
            <NavLink href="/reports">工作汇报</NavLink>
            <NavLink href="/works">工作清单</NavLink>
            <NavLink href="/history">历史记录</NavLink>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <ReportEditor
          periodType={periodType}
          onPeriodTypeChange={handlePeriodTypeChange}
          periodTypeName={periodTypeName}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          selectedPeriodIndex={selectedPeriodIndex}
          onPeriodIndexChange={handlePeriodIndexChange}
          yearOptions={yearOptions}
          periodOptions={periodOptions}
          targetName={targetName}
          periodInfo={periodInfo}
          report={report}
          viewingVersion={viewingVersion}
          versions={versions}
          onLoadVersion={loadVersion}
          user={user}
          routineItems={routineItems}
          nonRoutineItems={nonRoutineItems}
          workList={workList}
          showRoutineSelect={showRoutineSelect}
          onShowRoutineSelect={setShowRoutineSelect}
          showNonRoutineSelect={showNonRoutineSelect}
          onShowNonRoutineSelect={setShowNonRoutineSelect}
          onUpdateRoutine={itemOps.update(routineItems, setRoutineItems)}
          onRemoveRoutine={itemOps.remove(routineItems, setRoutineItems)}
          onMoveRoutine={itemOps.move(routineItems, setRoutineItems)}
          onImportRoutine={itemOps.import(routineItems, setRoutineItems, setShowRoutineSelect)}
          onUpdateNonRoutine={itemOps.update(nonRoutineItems, setNonRoutineItems)}
          onRemoveNonRoutine={itemOps.remove(nonRoutineItems, setNonRoutineItems)}
          onMoveNonRoutine={itemOps.move(nonRoutineItems, setNonRoutineItems)}
          onImportNonRoutine={itemOps.import(nonRoutineItems, setNonRoutineItems, setShowNonRoutineSelect)}
          notes={notes}
          onNotesChange={setNotes}
          saving={saving}
          onSubmit={handleSubmit}
        />
      </main>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
