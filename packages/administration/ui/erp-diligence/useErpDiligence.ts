"use client";

import { useAsyncResource } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type { ErpDiligenceDraft, ErpDiligenceSubmissionDto, ErpDiligenceWorkspaceDto } from "@workspace/administration/types";
import type { SessionUser } from "@workspace/platform/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY_WORKSPACE: ErpDiligenceWorkspaceDto = {
  submission: null,
  submissions: [],
  canViewAll: false,
};

function emptyDraft(user: SessionUser): ErpDiligenceDraft {
  return {
    respondentName: user.employeeName?.trim() || user.username,
    departmentName: user.departmentName?.trim() || "",
    roleTitle: "",
    primaryArea: "",
    status: "draft",
    answers: {},
    processSteps: [],
    evidenceItems: [],
  };
}

function responseError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

export function useErpDiligence(user: SessionUser) {
  const initialDraft = useMemo(() => emptyDraft(user), [user]);
  const [draft, setDraft] = useState<ErpDiligenceDraft>(initialDraft);
  const [saving, setSaving] = useState(false);

  const loadWorkspace = useCallback(async (): Promise<ErpDiligenceWorkspaceDto> => {
    const response = await fetch(workspacePath("/api/modules/administration/erp-diligence"));
    const data = await response.json().catch(() => null) as unknown;
    const workspace = data as Partial<ErpDiligenceWorkspaceDto> | null;
    if (!response.ok || !workspace || !Array.isArray(workspace.submissions) || !("submission" in workspace)) {
      throw new Error(responseError(data, `加载尽调表失败 (${response.status})`));
    }
    return workspace as ErpDiligenceWorkspaceDto;
  }, []);

  const resource = useAsyncResource(loadWorkspace, {
    initialData: EMPTY_WORKSPACE,
    resetOnError: true,
    errorMessage: "加载尽调表失败",
  });

  useEffect(() => {
    setDraft(resource.data.submission ?? initialDraft);
  }, [initialDraft, resource.data.submission]);

  const save = useCallback(async (status: ErpDiligenceDraft["status"]) => {
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/administration/erp-diligence"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentName: draft.departmentName,
          roleTitle: draft.roleTitle,
          primaryArea: draft.primaryArea,
          status,
          answers: draft.answers,
          processSteps: draft.processSteps,
          evidenceItems: draft.evidenceItems,
        }),
      });
      const data = await response.json().catch(() => null) as { submission?: ErpDiligenceSubmissionDto; error?: string } | null;
      if (!response.ok || !data?.submission) {
        throw new Error(responseError(data, `保存失败 (${response.status})`));
      }
      const submission = data.submission;
      setDraft(submission);
      resource.setData((current) => ({
        ...current,
        submission,
        submissions: current.canViewAll
          ? [submission, ...current.submissions.filter((item) => item.id !== submission.id)]
          : current.submissions,
      }));
      return submission;
    } finally {
      setSaving(false);
    }
  }, [draft, resource]);

  return {
    ...resource,
    draft,
    setDraft,
    saving,
    save,
  };
}
