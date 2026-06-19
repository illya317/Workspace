"use client";

import { useState, useMemo, useEffect } from "react";
import { matchEmployee, matchText } from "@workspace/platform/search";
import type { Subject, PermissionState, SubjectType } from "../types";
import { ROLE_PRIORITY } from "../lib";

export function usePermissionFilters(
  rawSubjects: Subject[],
  subjectType: SubjectType,
  getPermissionState: (subject: Subject, roleKey: string) => PermissionState,
  roles: { key: string; name: string; color: string }[]
) {
  const [l1Dept, setL1Dept] = useState("全部");
  const [l2Dept, setL2Dept] = useState("全部");
  const [l3Dept, setL3Dept] = useState("全部");
  const [nameSearch, setNameSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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

    result.sort((a, b) => {
      const aScore = Math.max(
        ...roles.map((r) =>
          getPermissionState(a, r.key).has
            ? ROLE_PRIORITY[r.key] || 0
            : 0
        )
      );
      const bScore = Math.max(
        ...roles.map((r) =>
          getPermissionState(b, r.key).has
            ? ROLE_PRIORITY[r.key] || 0
            : 0
        )
      );
      return bScore - aScore;
    });

    return result;
  }, [
    rawSubjects,
    l1Dept,
    l2Dept,
    l3Dept,
    nameSearch,
    subjectType,
    getPermissionState,
    roles,
  ]);

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
    subjects,
  };
}
