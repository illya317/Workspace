"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCurrentWeekInfo, getWeekRange } from "@/lib/week";

interface User {
  id: number;
  name: string;
  departmentId: number;
  departmentName?: string | null;
}

interface ReportItemData {
  id?: number;
  category: string;
  plan: string;
  completion: string;
  nextGoal: string;
  sortOrder: number;
}

interface Report {
  id: number;
  year: number;
  weekNumber: number;
  taskName: string;
  notes: string | null;
  version: number;
  items: ReportItemData[];
  user?: {
    name: string;
    departmentName: string | null;
  };
}

interface WeekInfo {
  year: number;
  weekNumber: number;
  label: string;
  dateRange: string;
}

interface ItemRow {
  plan: string;
  completion: string;
  nextGoal: string;
  isImported?: boolean;
  isNew?: boolean;
}

function AutoResizeTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [props.value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`resize-none overflow-hidden text-gray-900 ${className || ""}`}
      {...props}
    />
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");

  const [routineItems, setRoutineItems] = useState<ItemRow[]>([]);
  const [nonRoutineItems, setNonRoutineItems] = useState<ItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRoutineSetup, setShowRoutineSetup] = useState(false);

  const currentInfo = getCurrentWeekInfo();
  const [selectedYear, setSelectedYear] = useState(currentInfo.year);
  const [selectedWeek, setSelectedWeek] = useState(currentInfo.weekNumber);

  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string }>>([]);
  const [viewingVersion, setViewingVersion] = useState(0);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user);
      const info = getCurrentWeekInfo();
      setSelectedYear(info.year);
      setSelectedWeek(info.weekNumber);
      await loadDashboard(data.user, info.year, info.weekNumber);
    } catch {
      router.push("/login");
    }
  }

  async function loadDashboard(user: User, year: number, weekNumber: number) {
    const range = getWeekRange(year, weekNumber);
    setWeekInfo({
      year,
      weekNumber,
      label: range.label,
      dateRange: range.dateRange,
    });

    const [reportsRes, prevRes, routineRes] = await Promise.all([
      fetch(`/api/reports?year=${year}&week=${weekNumber}`),
      (() => {
        const prevWeek = weekNumber - 1;
        const prevYear = prevWeek < 1 ? year - 1 : year;
        const actualPrevWeek = prevWeek < 1 ? 52 : prevWeek;
        return fetch(`/api/reports?year=${prevYear}&week=${actualPrevWeek}`);
      })(),
      fetch("/api/user/routine"),
    ]);

    const reportsData = await reportsRes.json();
    const prevData = await prevRes.json();
    const routineData = await routineRes.json();

    if (reportsData.reports?.length > 0) {
      const r = reportsData.reports[0];
      setReport(r);
      setTaskName(r.taskName);
      setNotes(r.notes || "");
      setViewingVersion(0);

      const versionsRes = await fetch(`/api/reports/${r.id}/versions`);
      const versionsData = await versionsRes.json();
      setVersions(versionsData.history || []);

      setRoutineItems(
        r.items
          .filter((i: ReportItemData) => i.category === "routine")
          .sort((a: ReportItemData, b: ReportItemData) => a.sortOrder - b.sortOrder)
          .map((i: ReportItemData) => ({
            plan: i.plan,
            completion: i.completion || "",
            nextGoal: i.nextGoal || "",
            isImported: true,
          }))
      );

      setNonRoutineItems(
        r.items
          .filter((i: ReportItemData) => i.category === "non-routine")
          .sort((a: ReportItemData, b: ReportItemData) => a.sortOrder - b.sortOrder)
          .map((i: ReportItemData) => ({
            plan: i.plan,
            completion: i.completion || "",
            nextGoal: i.nextGoal || "",
            isImported: true,
          }))
      );
    } else {
      setReport(null);
      setTaskName(user.departmentName || "");
      setNotes("");
      setVersions([]);
      setViewingVersion(0);

      const prevReport = prevData.reports?.[0];
      const prevItems = prevReport?.items || [];

      const prevRoutineItems = prevItems
        .filter((i: ReportItemData) => i.category === "routine")
        .sort((a: ReportItemData, b: ReportItemData) => a.sortOrder - b.sortOrder);

      const prevNonRoutineItems = prevItems
        .filter((i: ReportItemData) => i.category === "non-routine")
        .sort((a: ReportItemData, b: ReportItemData) => a.sortOrder - b.sortOrder);

      // 日常工作：优先从上周 nextGoal 导入 completion，plan 保留原值传给后端
      if (prevRoutineItems.length > 0) {
        setRoutineItems(
          prevRoutineItems.map((i: ReportItemData) => ({
            plan: i.nextGoal || i.plan,
            completion: i.nextGoal || "",
            nextGoal: "",
            isImported: true,
          }))
        );
      } else if (routineData.routineItems?.length > 0) {
        setRoutineItems(
          routineData.routineItems.map(
            (r: { plan: string; nextGoal?: string }) => ({
              plan: r.plan,
              completion: "",
              nextGoal: r.nextGoal || "",
              isImported: true,
            })
          )
        );
      } else {
        setRoutineItems([]);
        setShowRoutineSetup(true);
      }

      // 其他工作：从上周 nextGoal 导入 completion，plan 保留原值
      if (prevNonRoutineItems.length > 0) {
        setNonRoutineItems(
          prevNonRoutineItems.map((i: ReportItemData) => ({
            plan: i.nextGoal || "",
            completion: i.nextGoal || "",
            nextGoal: "",
            isImported: true,
          }))
        );
      } else {
        setNonRoutineItems([]);
      }
    }

    setLoading(false);
  }

  function updateRoutineItem(index: number, field: keyof ItemRow, value: string) {
    const next = [...routineItems];
    next[index] = { ...next[index], [field]: value };
    setRoutineItems(next);
  }

  function addRoutineItem() {
    setRoutineItems([...routineItems, { plan: "", completion: "", nextGoal: "", isNew: true }]);
  }

  function removeRoutineItem(index: number) {
    setRoutineItems(routineItems.filter((_, i) => i !== index));
  }

  function moveRoutineItem(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= routineItems.length) return;
    const next = [...routineItems];
    [next[index], next[target]] = [next[target], next[index]];
    setRoutineItems(next);
  }

  function updateNonRoutineItem(index: number, field: keyof ItemRow, value: string) {
    const next = [...nonRoutineItems];
    next[index] = { ...next[index], [field]: value };
    setNonRoutineItems(next);
  }

  function addNonRoutineItem() {
    setNonRoutineItems([...nonRoutineItems, { plan: "", completion: "", nextGoal: "", isNew: true }]);
  }

  function removeNonRoutineItem(index: number) {
    setNonRoutineItems(nonRoutineItems.filter((_, i) => i !== index));
  }

  function moveNonRoutineItem(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= nonRoutineItems.length) return;
    const next = [...nonRoutineItems];
    [next[index], next[target]] = [next[target], next[index]];
    setNonRoutineItems(next);
  }

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const year = parseInt(e.target.value);
    setSelectedYear(year);
    if (user) {
      setLoading(true);
      loadDashboard(user, year, selectedWeek);
    }
  }

  function handleWeekChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const week = parseInt(e.target.value);
    setSelectedWeek(week);
    if (user) {
      setLoading(true);
      loadDashboard(user, selectedYear, week);
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => 2024 + i);
  const weekOptions = Array.from({ length: 53 }, (_, i) => i + 1);

  async function loadVersion(version: number) {
    if (!report) return;
    setViewingVersion(version);
    if (version === 0) {
      await loadDashboard(user!, selectedYear, selectedWeek);
      return;
    }

    const res = await fetch(`/api/reports/${report.id}/versions/${version}`);
    const data = await res.json();
    if (data.report) {
      const r = data.report;
      setTaskName(r.taskName);
      setNotes(r.notes || "");
      setRoutineItems(
        (r.items || [])
          .filter((i: ReportItemData) => i.category === "routine")
          .map((i: ReportItemData) => ({
            plan: i.plan,
            completion: i.completion || "",
            nextGoal: i.nextGoal || "",
            isImported: true,
          }))
      );
      setNonRoutineItems(
        (r.items || [])
          .filter((i: ReportItemData) => i.category === "non-routine")
          .map((i: ReportItemData) => ({
            plan: i.plan,
            completion: i.completion || "",
            nextGoal: i.nextGoal || "",
            isImported: true,
          }))
      );
    }
  }

  async function saveRoutineTemplate() {
    const template = routineItems.map((item) => ({
      plan: item.plan,
      nextGoal: item.nextGoal,
    }));

    const res = await fetch("/api/user/routine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routineItems: template }),
    });

    if (res.ok) {
      alert("日常工作模板已保存");
      setShowRoutineSetup(false);
    } else {
      alert("保存失败");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const items: Omit<ReportItemData, "id">[] = [
      ...routineItems.map((item, index) => ({
        category: "routine",
        plan: item.completion || item.plan,
        completion: item.completion,
        nextGoal: item.nextGoal,
        sortOrder: index,
      })),
      ...nonRoutineItems.map((item, index) => ({
        category: "non-routine",
        plan: item.completion || item.plan,
        completion: item.completion,
        nextGoal: item.nextGoal,
        sortOrder: index,
      })),
    ];

    const body = report
      ? { taskName, notes, items }
      : { taskName, notes, items, year: selectedYear, weekNumber: selectedWeek };

    let res;
    if (report) {
      res = await fetch(`/api/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    if (res.ok) {
      alert(report ? "更新成功" : "提交成功");
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        if (report) {
          const versionsRes = await fetch(`/api/reports/${report.id}/versions`);
          const versionsData = await versionsRes.json();
          setVersions(versionsData.history || []);
        }
      }
    } else {
      const err = await res.json();
      alert(err.error || "操作失败");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="丰华生物" width={100} height={30} className="h-auto w-auto max-w-[100px] object-contain" />
            <span className="text-lg font-semibold text-gray-800">丰华工作台</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <Link href="/history" className="text-sm text-gray-900 hover:underline">
              历史记录
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 p-4 text-center text-white">
          <div className="mb-2 flex items-center justify-center gap-3">
            <select
              value={selectedYear}
              onChange={handleYearChange}
              className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y} className="text-gray-800">
                  {y} 年
                </option>
              ))}
            </select>
            <select
              value={selectedWeek}
              onChange={handleWeekChange}
              className="rounded-md border-0 bg-white/20 px-3 py-1.5 text-sm text-white backdrop-blur-sm focus:ring-2 focus:ring-white/50"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w} className="text-gray-800">
                  第 {w} 周
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm opacity-90">{weekInfo?.dateRange}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 任务名称 */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                部门工作 / 任务名称 <span className="text-red-500">*</span>
              </label>
              {report && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>填写人：{report.user?.name || user?.name}</span>
                  {report.version > 1 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                      V{report.version}
                    </span>
                  )}
                </div>
              )}
            </div>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              required
              disabled={viewingVersion !== 0}
              className={`w-full rounded-md border px-3 py-2 text-gray-900 focus:border-emerald-400 focus:outline-none ${
                viewingVersion !== 0
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-300"
              }`}
              placeholder="例如：财务部"
            />

            {report && versions.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">历史版本：</span>
                <select
                  value={viewingVersion}
                  onChange={(e) => loadVersion(parseInt(e.target.value))}
                  className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none"
                >
                  <option value={0}>最新版 (V{report.version})</option>
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      V{v.version} ({new Date(v.createdAt).toLocaleDateString("zh-CN")})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 日常工作 */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">日常工作</h3>
                <p className="text-xs text-gray-500">每周固定工作，自动从模板带入</p>
              </div>
              {viewingVersion === 0 && (
                <button
                  type="button"
                  onClick={saveRoutineTemplate}
                  className="rounded-md border border-emerald-500 px-3 py-1 text-sm text-emerald-600 transition-colors hover:bg-emerald-50"
                >
                  保存为模板
                </button>
              )}
            </div>

            {showRoutineSetup && routineItems.length === 0 && viewingVersion === 0 && (
              <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                首次使用，请先添加日常工作条目，然后点击"保存为模板"
              </div>
            )}

            <div className="space-y-3">
              {routineItems.map((item, index) => (
                <div key={index} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">第 {index + 1} 条</span>
                    {viewingVersion === 0 && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveRoutineItem(index, -1)}
                          disabled={index === 0}
                          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveRoutineItem(index, 1)}
                          disabled={index === routineItems.length - 1}
                          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRoutineItem(index)}
                          className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <AutoResizeTextarea
                      value={item.completion}
                      onChange={(e) => updateRoutineItem(index, "completion", e.target.value)}
                      placeholder="完成情况"
                      disabled={viewingVersion !== 0}
                      className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                        viewingVersion !== 0
                          ? "border-gray-200 bg-gray-100 text-gray-500"
                          : "border-gray-200 focus:border-emerald-400"
                      }`}
                    />
                    <AutoResizeTextarea
                      value={item.nextGoal}
                      onChange={(e) => updateRoutineItem(index, "nextGoal", e.target.value)}
                      placeholder="下周目标"
                      disabled={viewingVersion !== 0}
                      className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                        viewingVersion !== 0
                          ? "border-gray-200 bg-gray-100 text-gray-500"
                          : "border-gray-200 focus:border-emerald-400"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {viewingVersion === 0 && (
              <button
                type="button"
                onClick={addRoutineItem}
                className="mt-3 text-sm text-emerald-600 hover:underline"
              >
                + 添加日常工作
              </button>
            )}
          </div>

          {/* 其他工作 */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-base font-semibold text-gray-800">其他工作</h3>

            <div className="space-y-3">
              {nonRoutineItems.map((item, index) => (
                <div key={index} className="rounded-md border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">第 {index + 1} 条</span>
                    {viewingVersion === 0 && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveNonRoutineItem(index, -1)}
                          disabled={index === 0}
                          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveNonRoutineItem(index, 1)}
                          disabled={index === nonRoutineItems.length - 1}
                          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNonRoutineItem(index)}
                          className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <AutoResizeTextarea
                      value={item.completion}
                      onChange={(e) => updateNonRoutineItem(index, "completion", e.target.value)}
                      placeholder="完成情况"
                      disabled={viewingVersion !== 0}
                      className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                        viewingVersion !== 0
                          ? "border-gray-200 bg-gray-100 text-gray-500"
                          : "border-gray-200 focus:border-emerald-400"
                      }`}
                    />
                    <AutoResizeTextarea
                      value={item.nextGoal}
                      onChange={(e) => updateNonRoutineItem(index, "nextGoal", e.target.value)}
                      placeholder="下周目标"
                      disabled={viewingVersion !== 0}
                      className={`rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                        viewingVersion !== 0
                          ? "border-gray-200 bg-gray-100 text-gray-500"
                          : "border-gray-200 focus:border-emerald-400"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {viewingVersion === 0 && (
              <button
                type="button"
                onClick={addNonRoutineItem}
                className="mt-3 rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-emerald-400 hover:text-emerald-600"
              >
                + 添加其他工作
              </button>
            )}
          </div>

          {/* 备注 */}
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={viewingVersion !== 0}
              className={`w-full rounded-md border px-3 py-2 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none ${
                viewingVersion !== 0
                  ? "border-gray-200 bg-gray-100 text-gray-500"
                  : "border-gray-300"
              }`}
              placeholder="其他补充说明..."
            />
          </div>

          {/* 历史版本提示 */}
          {viewingVersion !== 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-center text-sm text-amber-700">
              当前查看历史版本 V{viewingVersion}，不可编辑
            </div>
          )}

          {/* 提交 */}
          {viewingVersion === 0 && (
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-gradient-to-r from-emerald-500 to-emerald-700 py-3 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中..." : report ? "更新周报" : "提交周报"}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
