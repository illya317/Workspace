import { useState, useCallback } from "react";
import {
  getPeriodRange,
  getPreviousPeriod,
} from "@workspace/core/period";
import type { PeriodType } from "@workspace/core/period";
import type { ReportUser } from "./useReportAuth";
import type { Report } from "../ReportEditor";
import type { ItemRow } from "../WorkSection";

interface PeriodInfo {
  label: string;
  dateRange: string;
}

interface LoadResult {
  report: Report | null;
  taskName: string;
  notes: string;
  routineItems: ItemRow[];
  nonRoutineItems: ItemRow[];
  workList: Array<{ id: number; category: string; content: string }>;
  periodInfo: PeriodInfo;
  versions: Array<{ version: number; createdAt: string }>;
}

export async function fetchReportData(
  user: ReportUser,
  periodType: PeriodType,
  year: number,
  periodIndex: number,
  targetType: string,
  targetId: number
): Promise<LoadResult> {
  const range = getPeriodRange(periodType, year, periodIndex);
  const periodInfo: PeriodInfo = { label: range.label, dateRange: range.dateRange };

  const targetParam = targetType && targetId ? `&targetType=${targetType}&targetIds=${targetId}` : "";
  const date = range.date;
  const prev = getPreviousPeriod(periodType, year, periodIndex);
  const prevDate = prev.date;

  const [reportsRes, prevRes, worksRes] = await Promise.all([
    fetch(`/workspace/api/reports?date=${date}${targetParam}`),
    fetch(`/workspace/api/reports?date=${prevDate}${targetParam}`),
    fetch(targetType && targetId ? `/api/works?targetType=${targetType}&targetId=${targetId}` : `/api/works?deptId=${user.departmentId}`),
  ]);

  const reportsData = await reportsRes.json();
  const prevData = await prevRes.json();
  const worksData = await worksRes.json();
  const works: Array<{ id: number; category: string; content: string }> = worksData.works || [];

  if (reportsData.reports?.length > 0) {
    const r = reportsData.reports[0] as Report;
    const vRes = await fetch(`/workspace/api/reports/${r.id}/versions`);
    const vData = await vRes.json();

    const mapItems = (cat: string) =>
      (r.items || [])
        .filter((i) => i.category === cat)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          plan: i.plan,
          completion: i.completion || "",
          nextGoal: i.nextGoal || "",
          workId: i.workItemId ?? undefined,
          isImported: true,
        }));

    return {
      report: r,
      taskName: r.taskName,
      notes: r.notes || "",
      routineItems: mapItems("routine"),
      nonRoutineItems: mapItems("non-routine"),
      workList: works,
      periodInfo,
      versions: vData.history || [],
    };
  }

  // No report: build from works or previous period
  const prevReport = prevData.reports?.[0];
  const prevItems: Array<{ category: string; plan: string; completion: string; nextGoal: string; workItemId?: number | null; sortOrder: number }> = prevReport?.items || [];

  const goalMap = new Map<number, string>();
  for (const item of prevItems) {
    if (item.workItemId && item.nextGoal) goalMap.set(item.workItemId, item.nextGoal);
  }

  function buildItems(cat: string): ItemRow[] {
    const deptWorks = works.filter((w) => w.category === cat);
    const prevCat = prevItems.filter((i) => i.category === cat);
    if (deptWorks.length > 0) {
      return deptWorks.map((w) => ({
        plan: w.content,
        completion: "",
        nextGoal: "",
        workId: w.id,
        lastWeekGoal: goalMap.get(w.id) || "",
        isImported: true,
      }));
    } else if (prevCat.length > 0) {
      return prevCat.map((i) => ({
        plan: i.nextGoal || i.plan,
        completion: "",
        nextGoal: "",
        workId: i.workItemId ?? undefined,
        lastWeekGoal: i.workItemId ? goalMap.get(i.workItemId) || "" : "",
        isImported: true,
      }));
    }
    return [];
  }

  return {
    report: null,
    taskName: "",
    notes: "",
    routineItems: buildItems("routine"),
    nonRoutineItems: buildItems("non-routine"),
    workList: works,
    periodInfo,
    versions: [],
  };
}

export function useReportLoader() {
  const [report, setReport] = useState<Report | null>(null);
  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [routineItems, setRoutineItems] = useState<ItemRow[]>([]);
  const [nonRoutineItems, setNonRoutineItems] = useState<ItemRow[]>([]);
  const [workList, setWorkList] = useState<Array<{ id: number; category: string; content: string }>>([]);
  const [periodInfo, setPeriodInfo] = useState<PeriodInfo | null>(null);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string }>>([]);
  const [viewingVersion, setViewingVersion] = useState(0);

  const loadReport = useCallback(
    async (
      user: ReportUser,
      periodType: PeriodType,
      year: number,
      periodIndex: number,
      targetType: string,
      targetId: number
    ) => {
      const result = await fetchReportData(user, periodType, year, periodIndex, targetType, targetId);
      setReport(result.report);
      setTaskName(result.taskName);
      setNotes(result.notes);
      setRoutineItems(result.routineItems);
      setNonRoutineItems(result.nonRoutineItems);
      setWorkList(result.workList);
      setPeriodInfo(result.periodInfo);
      setVersions(result.versions);
      setViewingVersion(0);
      return result;
    },
    []
  );

  const loadVersion = useCallback(
    async (reportId: number, version: number) => {
      const res = await fetch(`/workspace/api/reports/${reportId}/versions/${version}`);
      const data = await res.json();
      if (data.report) {
        const r = data.report as Report;
        setTaskName(r.taskName);
        setNotes(r.notes || "");
        const map = (cat: string) =>
          (r.items || [])
            .filter((i: { category: string }) => i.category === cat)
            .map((i: { plan: string; completion: string; nextGoal: string; workItemId?: number | null }) => ({
              plan: i.plan,
              completion: i.completion || "",
              nextGoal: i.nextGoal || "",
              workId: i.workItemId ?? undefined,
              isImported: true,
            }));
        setRoutineItems(map("routine"));
        setNonRoutineItems(map("non-routine"));
      }
    },
    []
  );

  return {
    report,
    taskName,
    setTaskName,
    notes,
    setNotes,
    routineItems,
    setRoutineItems,
    nonRoutineItems,
    setNonRoutineItems,
    workList,
    setWorkList,
    periodInfo,
    versions,
    setReport,
    setVersions,
    viewingVersion,
    setViewingVersion,
    loadReport,
    loadVersion,
  };
}
