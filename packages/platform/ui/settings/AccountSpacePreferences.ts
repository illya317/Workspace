"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchPreferredDepartmentSettings,
  fetchPreferredProjectSettings,
  savePreferredDepartmentIds,
  savePreferredProjectIds,
  type PreferredDepartmentOption,
  type PreferredProjectOption,
} from "../space-preferences";

type FeedbackLike = {
  success: (message: string) => void;
  error: (message: string) => void;
};

type FeedbackRef = {
  current: FeedbackLike;
};

function normalizePreferenceIds(ids: number[]) {
  return Array.from(new Set(ids.filter((id) => id > 0))).slice(0, 3);
}

export function useAccountSpacePreferences(feedbackRef: FeedbackRef) {
  const [preferredDepartments, setPreferredDepartments] = useState<PreferredDepartmentOption[]>([]);
  const [preferredDepartmentIds, setPreferredDepartmentIds] = useState<number[]>([]);
  const preferredDepartmentIdsRef = useRef<number[]>([]);
  const preferredDepartmentSaveSeq = useRef(0);
  const [preferredProjects, setPreferredProjects] = useState<PreferredProjectOption[]>([]);
  const [preferredProjectIds, setPreferredProjectIds] = useState<number[]>([]);
  const preferredProjectIdsRef = useRef<number[]>([]);
  const preferredProjectSaveSeq = useRef(0);

  useEffect(() => {
    preferredDepartmentIdsRef.current = preferredDepartmentIds;
  }, [preferredDepartmentIds]);

  useEffect(() => {
    preferredProjectIdsRef.current = preferredProjectIds;
  }, [preferredProjectIds]);

  useEffect(() => {
    let cancelled = false;
    fetchPreferredDepartmentSettings()
      .then((settings) => {
        if (cancelled) return;
        setPreferredDepartments(settings.departments);
        setPreferredDepartmentIds(settings.preferredDepartmentIds);
      })
      .catch((error) => {
        if (!cancelled) feedbackRef.current.error(error instanceof Error ? error.message : "加载常用部门失败");
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackRef]);

  useEffect(() => {
    let cancelled = false;
    fetchPreferredProjectSettings()
      .then((settings) => {
        if (cancelled) return;
        setPreferredProjects(settings.projects);
        setPreferredProjectIds(settings.preferredProjectIds);
      })
      .catch((error) => {
        if (!cancelled) feedbackRef.current.error(error instanceof Error ? error.message : "加载常用项目失败");
      });
    return () => {
      cancelled = true;
    };
  }, [feedbackRef]);

  async function persistPreferredDepartments(nextIds: number[]) {
    const saveSeq = preferredDepartmentSaveSeq.current + 1;
    preferredDepartmentSaveSeq.current = saveSeq;
    try {
      const data = await savePreferredDepartmentIds(nextIds);
      if (preferredDepartmentSaveSeq.current !== saveSeq) return;
      preferredDepartmentIdsRef.current = data.preferredDepartmentIds;
      setPreferredDepartmentIds(data.preferredDepartmentIds);
      feedbackRef.current.success("常用部门已更新");
    } catch (error) {
      if (preferredDepartmentSaveSeq.current === saveSeq) {
        feedbackRef.current.error(error instanceof Error ? error.message : "保存常用部门失败");
      }
    }
  }

  async function persistPreferredProjects(nextIds: number[]) {
    const saveSeq = preferredProjectSaveSeq.current + 1;
    preferredProjectSaveSeq.current = saveSeq;
    try {
      const data = await savePreferredProjectIds(nextIds);
      if (preferredProjectSaveSeq.current !== saveSeq) return;
      preferredProjectIdsRef.current = data.preferredProjectIds;
      setPreferredProjectIds(data.preferredProjectIds);
      feedbackRef.current.success("常用项目已更新");
    } catch (error) {
      if (preferredProjectSaveSeq.current === saveSeq) {
        feedbackRef.current.error(error instanceof Error ? error.message : "保存常用项目失败");
      }
    }
  }

  function setPreferredDepartmentAt(index: number, value: unknown) {
    const departmentId = Number(value || 0);
    const next = [...preferredDepartmentIdsRef.current];
    if (departmentId > 0) next[index] = departmentId;
    else next.splice(index, 1);
    const normalized = normalizePreferenceIds(next);
    preferredDepartmentIdsRef.current = normalized;
    setPreferredDepartmentIds(normalized);
    void persistPreferredDepartments(normalized);
  }

  function setPreferredProjectAt(index: number, value: unknown) {
    const projectId = Number(value || 0);
    const next = [...preferredProjectIdsRef.current];
    if (projectId > 0) next[index] = projectId;
    else next.splice(index, 1);
    const normalized = normalizePreferenceIds(next);
    preferredProjectIdsRef.current = normalized;
    setPreferredProjectIds(normalized);
    void persistPreferredProjects(normalized);
  }

  return {
    preferredDepartments,
    preferredDepartmentIds,
    preferredProjects,
    preferredProjectIds,
    setPreferredDepartmentAt,
    setPreferredProjectAt,
  };
}
