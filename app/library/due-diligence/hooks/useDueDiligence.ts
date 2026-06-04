"use client";

import { useState, useEffect, useCallback } from "react";

export interface DueDiligenceRequest {
  id: number;
  title: string;
  status: string;
  defaultConfidentialityLevel: number;
  createdAt: string;
  updatedAt: string;
  _count?: { questions: number };
}

export function useDueDiligenceRequests() {
  const [requests, setRequests] = useState<DueDiligenceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    fetch("/api/library/due-diligence")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DueDiligenceRequest[]) => setRequests(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createRequest = useCallback(async (title: string, partyName: string) => {
    const res = await fetch("/api/library/due-diligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, partyName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Create failed" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    refresh();
    return res.json();
  }, [refresh]);

  const deleteRequest = useCallback(async (id: number) => {
    const res = await fetch(`/api/library/due-diligence/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    refresh();
  }, [refresh]);

  return { requests, loading, error, refresh, createRequest, deleteRequest };
}

export interface MaterialItem {
  id: number;
  documentId: number;
  documentVersionId: number | null;
  matchScore: number | null;
  reason: string | null;
  selected: boolean;
  document: {
    id: number;
    title: string | null;
    fileName: string;
    categoryName: string | null;
    confidentialityLevel: number;
  };
}

export interface QuestionItem {
  id: number;
  questionText: string;
  status: string;
  materials: MaterialItem[];
}

export interface RequestDetail {
  id: number;
  title: string;
  status: string;
  defaultConfidentialityLevel: number;
  questions: QuestionItem[];
}

export function useDueDiligenceDetail(id: number | null) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!id) { setDetail(null); return; }
    setLoading(true);
    fetch(`/api/library/due-diligence/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RequestDetail | null) => setDetail(d))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const splitQuestions = useCallback(async (text: string) => {
    if (!id) throw new Error("No request id");
    const res = await fetch(`/api/library/due-diligence/${id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Split failed" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    refresh();
    return res.json();
  }, [id, refresh]);

  const runMatch = useCallback(async () => {
    if (!id) throw new Error("No request id");
    const res = await fetch(`/api/library/due-diligence/${id}/match`, { method: "POST" });
    if (!res.ok) throw new Error("Match failed");
    refresh();
    return res.json();
  }, [id, refresh]);

  const toggleMaterial = useCallback(async (questionId: number, selectionId: number, selected: boolean) => {
    const res = await fetch(`/api/library/due-diligence/${id}/questions/${questionId}/materials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectionId, selected }),
    });
    if (!res.ok) throw new Error("Update failed");
    refresh();
    return res.json();
  }, [id, refresh]);

  const updateStatus = useCallback(async (status: string) => {
    if (!id) throw new Error("No request id");
    const res = await fetch(`/api/library/due-diligence/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Update failed");
    refresh();
    return res.json();
  }, [id, refresh]);

  const archiveRequest = useCallback(async () => {
    if (!id) throw new Error("No request id");
    const res = await fetch(`/api/library/due-diligence/${id}/archive`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Archive failed" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    refresh();
    return res.json();
  }, [id, refresh]);

  return { detail, loading, refresh, splitQuestions, runMatch, toggleMaterial, updateStatus, archiveRequest };
}
