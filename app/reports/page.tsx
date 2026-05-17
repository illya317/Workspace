"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import NavLink from "@/app/components/NavLink";
import ReportGroupSwitcher from "@/app/components/ReportGroupSwitcher";
import { getCurrentWeekInfo, getWeekRange } from "@/lib/week";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import WorkSection, { type ItemRow } from "./WorkSection";

interface Report {
  id: number;
  date: string;
  taskName: string;
  notes: string | null;
  version: number;
  items: Array<{ id?: number; workItemId?: number | null; category: string; plan: string; completion: string; nextGoal: string; sortOrder: number }>;
  user?: { name: string; departmentName: string | null };
}

export default function ReportPage() {
  const router = useRouter();
  const { toast, showToast, closeToast } = useToast();

  const [user, setUser] = useState<{ id: number; name: string; departmentId: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewingVersion, setViewingVersion] = useState(0);

  const [report, setReport] = useState<Report | null>(null);
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [reportGroupId, setReportGroupId] = useState<number | null>(null);
  const [reportGroupName, setReportGroupName] = useState("");

  const [routineItems, setRoutineItems] = useState<ItemRow[]>([]);
  const [nonRoutineItems, setNonRoutineItems] = useState<ItemRow[]>([]);
  const [showRoutineSelect, setShowRoutineSelect] = useState(false);
  const [showNonRoutineSelect, setShowNonRoutineSelect] = useState(false);
  const [workList, setWorkList] = useState<Array<{ id: number; category: string; content: string }>>([]);

  const [weekInfo, setWeekInfo] = useState<{ label: string; dateRange: string } | null>(null);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string }>>([]);
  const ci = getCurrentWeekInfo();
  const [selectedYear, setSelectedYear] = useState(ci.year);
  const [selectedWeek, setSelectedWeek] = useState(ci.weekNumber);

  const yearOptions = [ci.year];
  const weekOptions = ci.weekNumber > 1 ? [ci.weekNumber, ci.weekNumber - 1] : [1];

  useEffect(() => { fetchUser(); }, []);

  async function fetchUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) { router.push("/login"); return; }
      const data = await res.json();
      setUser(data.user);

      const gRes = await fetch("/api/report-groups/my");
      if (gRes.ok) {
        const gData = await gRes.json();
        if (!gData.isAdmin && gData.submitGroups.length === 0) { router.push("/reports"); return; }
      }

      const info = getCurrentWeekInfo();
      setSelectedYear(info.year);
      setSelectedWeek(info.weekNumber);
      await loadReport(data.user, info.year, info.weekNumber);
    } catch { router.push("/login"); }
  }

  async function loadReport(u: { id: number; name: string; departmentId: number }, year: number, weekNumber: number) {
    const range = getWeekRange(year, weekNumber);
    setWeekInfo({ label: range.label, dateRange: range.dateRange });

    const savedRgId = typeof window !== "undefined" ? localStorage.getItem("selectedReportGroupId") : null;
    const savedRgName = typeof window !== "undefined" ? localStorage.getItem("selectedReportGroupName") : null;
    const rgId = savedRgId ? parseInt(savedRgId) : null;
    setReportGroupId(rgId);
    if (savedRgName) setReportGroupName(savedRgName);
    const rgParam = rgId ? `&reportGroupId=${rgId}` : "";

    const date = range.weekStart.toISOString().slice(0, 10);
    const prevWeek = weekNumber - 1;
    const prevYear = prevWeek < 1 ? year - 1 : year;
    const prevDate = getWeekRange(prevYear, prevWeek < 1 ? 52 : prevWeek).weekStart.toISOString().slice(0, 10);

    const [reportsRes, prevRes, worksRes] = await Promise.all([
      fetch(`/api/reports?date=${date}${rgParam}`),
      fetch(`/api/reports?date=${prevDate}${rgParam}`),
      fetch(rgId ? `/api/works?reportGroupId=${rgId}` : `/api/works?deptId=${u.departmentId}`),
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
    setLoading(false);
  }

  async function loadVersion(version: number) {
    if (!report) return;
    setViewingVersion(version);
    if (version === 0) { await loadReport(user!, selectedYear, selectedWeek); return; }
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
    if (!reportGroupId && !report) { showToast("请先选择汇报对象", "error"); setSaving(false); return; }

    const items = [
      ...routineItems.map((it, i) => ({ category: "routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
      ...nonRoutineItems.map((it, i) => ({ category: "non-routine" as const, plan: it.completion || it.plan, completion: it.completion, nextGoal: it.nextGoal, sortOrder: i, workId: it.workId })),
    ];

    const autoTaskName = reportGroupName ? `${reportGroupName}第${selectedWeek}周周报` : taskName;
    const body = report
      ? { taskName: autoTaskName, notes, items }
      : { taskName: autoTaskName, notes, items, date: getWeekRange(selectedYear, selectedWeek).weekStart.toISOString().slice(0, 10), reportGroupId };

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/company/logo.png" alt="logo" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <ReportGroupSwitcher
              value={reportGroupId}
              onChange={(group) => {
                if (group) {
                  localStorage.setItem("selectedReportGroupId", String(group.id));
                  localStorage.setItem("selectedReportGroupName", group.name);
                  setReportGroupName(group.name);
                  setTaskName(group.name);
                } else {
                  localStorage.removeItem("selectedReportGroupId");
                  localStorage.removeItem("selectedReportGroupName");
                  setReportGroupName("");
                  setTaskName("");
                }
                setReportGroupId(group?.id ?? null);
                window.location.reload();
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
        {/* Header */}
        <div className="mb-6 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 p-4 text-center text-white">
          <div className="mb-2 flex items-center justify-center gap-3">
            <select value={selectedYear} onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setLoading(true); loadReport(user!, parseInt(e.target.value), selectedWeek); }}
              className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50">
              {yearOptions.map((y) => <option key={y} value={y} className="text-gray-800">{y} 年</option>)}
            </select>
            <select value={selectedWeek} onChange={(e) => { setSelectedWeek(parseInt(e.target.value)); setLoading(true); loadReport(user!, selectedYear, parseInt(e.target.value)); }}
              className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50">
              {weekOptions.map((w) => <option key={w} value={w} className="text-gray-800">第 {w} 周</option>)}
            </select>
          </div>
          <h2 className="mb-1 text-lg font-bold">
            {reportGroupName ? `${reportGroupName}第${selectedWeek}周周报` : "工作汇报"}
          </h2>
          <p className="text-sm opacity-90">{weekInfo?.dateRange}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Version info bar */}
          {report && (
            <div className="rounded-lg bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span>填写人：{report.user?.name || user?.name}</span>
                  {report.version > 1 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">V{report.version}</span>}
                </div>
                {versions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">历史版本：</span>
                    <select value={viewingVersion} onChange={(e) => loadVersion(parseInt(e.target.value))}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 focus:border-emerald-400 focus:outline-none">
                      <option value={0}>最新版 (V{report.version})</option>
                      {versions.map((v) => <option key={v.version} value={v.version}>V{v.version} ({new Date(v.createdAt).toLocaleDateString("zh-CN")})</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Work sections */}
          <WorkSection title="日常工作" subtitle="每周固定工作，自动从工作清单带入" items={routineItems} disabled={viewingVersion !== 0}
            workList={workList} category="routine" showImport={showRoutineSelect} onShowImport={setShowRoutineSelect}
            onImportWork={itemOps.import(routineItems, setRoutineItems, setShowRoutineSelect)}
            onUpdate={itemOps.update(routineItems, setRoutineItems)} onRemove={itemOps.remove(routineItems, setRoutineItems)}
            onMove={itemOps.move(routineItems, setRoutineItems)} />

          <WorkSection title="其他工作" subtitle="" items={nonRoutineItems} disabled={viewingVersion !== 0}
            workList={workList} category="non-routine" showImport={showNonRoutineSelect} onShowImport={setShowNonRoutineSelect}
            onImportWork={itemOps.import(nonRoutineItems, setNonRoutineItems, setShowNonRoutineSelect)}
            onUpdate={itemOps.update(nonRoutineItems, setNonRoutineItems)} onRemove={itemOps.remove(nonRoutineItems, setNonRoutineItems)}
            onMove={itemOps.move(nonRoutineItems, setNonRoutineItems)} />

          {/* Notes */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={viewingVersion !== 0}
              className={`w-full rounded-md border px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none ${viewingVersion !== 0 ? "border-gray-200 bg-gray-100 text-gray-500" : "border-gray-300"}`}
              placeholder="其他补充说明..." />
          </div>

          {viewingVersion !== 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700">当前查看历史版本 V{viewingVersion}，不可编辑</div>
          )}

          {viewingVersion === 0 && (
            <button type="submit" disabled={saving}
              className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-700 py-3 text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {saving ? "保存中..." : report ? "更新报告" : "提交报告"}
            </button>
          )}
        </form>
      </main>

      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
