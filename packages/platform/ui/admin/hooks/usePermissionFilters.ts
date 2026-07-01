"use client";

import { useState, useMemo, useEffect } from "react";
import { matchEmployee, matchText } from "@workspace/platform/search";
import { getPermissionActionRecordSortScore, sortPermissionSubjectsByScore } from "../../permission-matrix-model";
import type { Subject, SubjectType, PermissionActionRecord } from "../types";

const DEPARTMENT_FILTER_SEPARATOR = "\u001F";

function departmentFilterValue(path: string[]) {
  return path.join(DEPARTMENT_FILTER_SEPARATOR);
}

function parseDepartmentFilter(value: string) {
  return value ? value.split(DEPARTMENT_FILTER_SEPARATOR) : [];
}

export function usePermissionFilters(
  rawSubjects: Subject[],
  subjectType: SubjectType,
  getPermissionRecord: (subject: Subject) => PermissionActionRecord | null,
) {
  const [l1Dept, setL1Dept] = useState("全部");
  const [l2Dept, setL2Dept] = useState("全部");
  const [l3Dept, setL3Dept] = useState("全部");
  const [nameSearch, setNameSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(50);

  useEffect(() => {
    setL1Dept("全部");
    setL2Dept("全部");
    setL3Dept("全部");
  }, [subjectType]);

  function toggleRowExpand(subjectId: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  function setPageSize(nextPageSize: number) {
    setPageSizeState(nextPageSize);
    setPage(1);
  }

  const l1Options = useMemo(() => {
    const set = new Set(
      rawSubjects.map((s) => s.extra?.deptPath?.[0]).filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [rawSubjects]);

  const l2Options = useMemo(() => {
    const set = new Set(
      rawSubjects
        .filter((s) => l1Dept === "全部" || s.extra?.deptPath?.[0] === l1Dept)
        .map((s) => s.extra?.deptPath?.[1])
        .filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [rawSubjects, l1Dept]);

  const l3Options = useMemo(() => {
    const set = new Set(
      rawSubjects
        .filter(
          (s) =>
            (l1Dept === "全部" || s.extra?.deptPath?.[0] === l1Dept) &&
            (l2Dept === "全部" || s.extra?.deptPath?.[1] === l2Dept)
        )
        .map((s) => s.extra?.deptPath?.[2])
        .filter(Boolean)
    );
    return ["全部", ...Array.from(set)];
  }, [rawSubjects, l1Dept, l2Dept]);

  const departmentFilterOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string; searchText: string }>();
    for (const subject of rawSubjects) {
      const path = (subject.extra?.deptPath ?? []).filter(Boolean) as string[];
      for (let depth = 1; depth <= path.length; depth += 1) {
        const prefix = path.slice(0, depth);
        const value = departmentFilterValue(prefix);
        if (options.has(value)) continue;
        options.set(value, {
          value,
          label: prefix.join(" / "),
          searchText: prefix.join(" "),
        });
      }
    }
    return Array.from(options.values());
  }, [rawSubjects]);

  const nameSearchOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string; searchText: string }>();
    for (const subject of rawSubjects) {
      const name = subject.name.trim();
      if (!name || options.has(name)) continue;
      const employeeId = String(subject.extra?.employeeId ?? "");
      options.set(name, {
        value: name,
        label: subjectType === "user" && employeeId ? `${name} ${employeeId}` : name,
        searchText: [name, employeeId].filter(Boolean).join(" "),
      });
    }
    return Array.from(options.values());
  }, [rawSubjects, subjectType]);

  const selectedDepartmentFilter = useMemo(() => {
    const path = [l1Dept, l2Dept, l3Dept].filter((value) => value !== "全部");
    return departmentFilterValue(path);
  }, [l1Dept, l2Dept, l3Dept]);

  function setDepartmentFilter(value: string) {
    const [nextL1, nextL2, nextL3] = parseDepartmentFilter(value);
    setL1Dept(nextL1 ?? "全部");
    setL2Dept(nextL2 ?? "全部");
    setL3Dept(nextL3 ?? "全部");
  }

  const subjects = useMemo(() => {
    let result = [...rawSubjects];

    if (l1Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[0] === l1Dept);
    }
    if (l2Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[1] === l2Dept);
    }
    if (l3Dept !== "全部") {
      result = result.filter((s) => s.extra?.deptPath?.[2] === l3Dept);
    }

    if (nameSearch) {
      result = result.filter((s) => {
        if (subjectType === "user") {
          return matchEmployee(
            {
              name: s.name,
              employeeId: s.extra?.employeeId as string | undefined,
              alias: undefined,
            },
            nameSearch
          );
        }
        return matchText(s.name, nameSearch);
      });
    }

    return sortPermissionSubjectsByScore(
      result,
      (subject) => getPermissionActionRecordSortScore(getPermissionRecord(subject)),
    );
  }, [
    rawSubjects,
    l1Dept,
    l2Dept,
    l3Dept,
    nameSearch,
    subjectType,
    getPermissionRecord,
  ]);

  useEffect(() => {
    setPage(1);
  }, [l1Dept, l2Dept, l3Dept, nameSearch, subjectType, pageSize]);

  const totalSubjects = subjects.length;
  const totalPages = Math.max(1, Math.ceil(totalSubjects / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedSubjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return subjects.slice(start, start + pageSize);
  }, [subjects, currentPage, pageSize]);

  return {
    l1Dept,
    setL1Dept,
    l2Dept,
    setL2Dept,
    l3Dept,
    setL3Dept,
    nameSearch,
    setNameSearch,
    expandedRows,
    toggleRowExpand,
    l1Options,
    l2Options,
    l3Options,
    departmentFilterOptions,
    nameSearchOptions,
    selectedDepartmentFilter,
    setDepartmentFilter,
    subjects: pagedSubjects,
    totalSubjects,
    page: currentPage,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
  };
}
