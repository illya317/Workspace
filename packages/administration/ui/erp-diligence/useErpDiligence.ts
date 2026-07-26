"use client";

import { useAsyncResource } from "@workspace/core/hooks";
import { workspacePath } from "@workspace/core/routing";
import type {
  ErpDiligenceDraft,
  ErpDiligenceEvidenceAttachment,
  ErpDiligencePositionOption,
  ErpDiligenceSubmissionDto,
  ErpDiligenceWorkspaceDto,
} from "@workspace/administration/types";
import type { SessionUser } from "@workspace/platform/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY_WORKSPACE: ErpDiligenceWorkspaceDto = {
  submission: null,
  submissions: [],
  positionOptions: [],
  responsibilityPositionOptions: [],
  canViewAll: false,
};

function emptyDraft(user: SessionUser): ErpDiligenceDraft {
  return {
    respondentName: user.employeeName?.trim() || user.username,
    positionAssignmentId: null,
    departmentName: "",
    roleTitle: "",
    primaryArea: "",
    status: "draft",
    answers: {},
    processSteps: [],
    evidenceItems: [],
  };
}

function selectedPosition(
  options: readonly ErpDiligencePositionOption[],
  positionAssignmentId: number | null,
) {
  return options.find((option) => option.assignmentId === positionAssignmentId) ?? null;
}

function draftFromWorkspace(
  workspace: ErpDiligenceWorkspaceDto,
  initialDraft: ErpDiligenceDraft,
) {
  const source = workspace.submission ?? initialDraft;
  const selected = selectedPosition(workspace.positionOptions, source.positionAssignmentId)
    ?? (!workspace.submission
      ? workspace.positionOptions.find((option) => option.isPrimary) ?? workspace.positionOptions[0] ?? null
      : null);
  return {
    ...source,
    positionAssignmentId: selected?.assignmentId ?? null,
    roleTitle: selected?.positionName ?? "",
    departmentName: selected?.departmentName ?? "",
  };
}

function responseError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

function withUpdatedAttachments<T extends ErpDiligenceDraft>(
  current: T,
  evidenceKey: string,
  update: (attachments: ErpDiligenceEvidenceAttachment[]) => ErpDiligenceEvidenceAttachment[],
): T {
  return {
    ...current,
    evidenceItems: current.evidenceItems.map((item) => item.key === evidenceKey
      ? { ...item, attachments: update(item.attachments ?? []) }
      : item),
  };
}

export function useErpDiligence(user: SessionUser) {
  const initialDraft = useMemo(() => emptyDraft(user), [user]);
  const [draft, setDraft] = useState<ErpDiligenceDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [attachmentBusyKey, setAttachmentBusyKey] = useState<string | null>(null);

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
    setDraft(draftFromWorkspace(resource.data, initialDraft));
  }, [initialDraft, resource.data]);

  const save = useCallback(async (status: ErpDiligenceDraft["status"]) => {
    setSaving(true);
    try {
      const response = await fetch(workspacePath("/api/modules/administration/erp-diligence"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionAssignmentId: draft.positionAssignmentId,
          primaryArea: draft.primaryArea,
          status,
          answers: draft.answers,
          processSteps: draft.processSteps,
          evidenceItems: draft.evidenceItems.map(({ attachments: _attachments, ...item }) => item),
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

  const updateAttachmentState = useCallback((
    evidenceKey: string,
    update: (attachments: ErpDiligenceEvidenceAttachment[]) => ErpDiligenceEvidenceAttachment[],
  ) => {
    setDraft((current) => withUpdatedAttachments(current, evidenceKey, update));
    resource.setData((current) => ({
      ...current,
      submission: current.submission ? withUpdatedAttachments(current.submission, evidenceKey, update) : null,
      submissions: current.submissions.map((submission) => submission.id === current.submission?.id
        ? withUpdatedAttachments(submission, evidenceKey, update)
        : submission),
    }));
  }, [resource]);

  const uploadEvidenceAttachment = useCallback(async (evidenceKey: string, file: File) => {
    const evidence = draft.evidenceItems.find((item) => item.key === evidenceKey);
    if (!evidence?.documentType) throw new Error("请先选择材料类型");
    setAttachmentBusyKey(evidenceKey);
    try {
      await save("draft");
      const body = new FormData();
      body.set("evidenceKey", evidenceKey);
      body.set("file", file, file.name);
      const response = await fetch(workspacePath("/api/modules/administration/erp-diligence/attachments"), {
        method: "POST",
        body,
      });
      const data = await response.json().catch(() => null) as { attachment?: ErpDiligenceEvidenceAttachment; error?: string } | null;
      if (!response.ok || !data?.attachment) {
        throw new Error(responseError(data, `附件上传失败 (${response.status})`));
      }
      updateAttachmentState(evidenceKey, (attachments) => [...attachments, data.attachment!]);
      return data.attachment;
    } finally {
      setAttachmentBusyKey(null);
    }
  }, [draft.evidenceItems, save, updateAttachmentState]);

  const deleteEvidenceAttachment = useCallback(async (attachment: ErpDiligenceEvidenceAttachment) => {
    setAttachmentBusyKey(attachment.evidenceKey);
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/erp-diligence/attachments/${attachment.attachmentUid}`), {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null) as { attachmentUid?: string; error?: string } | null;
      if (!response.ok || data?.attachmentUid !== attachment.attachmentUid) {
        throw new Error(responseError(data, `附件删除失败 (${response.status})`));
      }
      updateAttachmentState(attachment.evidenceKey, (attachments) => (
        attachments.filter((item) => item.attachmentUid !== attachment.attachmentUid)
      ));
    } finally {
      setAttachmentBusyKey(null);
    }
  }, [updateAttachmentState]);

  return {
    ...resource,
    draft,
    setDraft,
    saving,
    save,
    attachmentBusyKey,
    uploadEvidenceAttachment,
    deleteEvidenceAttachment,
  };
}
