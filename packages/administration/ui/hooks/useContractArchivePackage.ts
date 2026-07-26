"use client";

import { workspacePath } from "@workspace/core/routing";
import {
  createFieldsSection,
  createMessageSection,
  createPanelSection,
  createSectionsSection,
  useFeedback,
} from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, FormSurfaceItemSpec } from "@workspace/core/ui";
import {
  CONTRACT_ATTACHMENT_KIND_OPTIONS,
  CONTRACT_RECORD_TYPE_OPTIONS,
  contractOptionLabel,
  type Contract,
  type ContractArchivePackage,
  type ContractAttachment,
  type ContractAttachmentKind,
  type ContractRecordInputType,
} from "@workspace/administration/types";
import { useCallback, useEffect, useState } from "react";

type ApprovalDraft = {
  sourceKey: string;
  externalRecordId: string;
  externalUrl: string;
  statusSnapshot: string;
  approvedOn: string;
  note: string;
};

type RecordDraft = {
  recordType: ContractRecordInputType;
  occurredOn: string;
  title: string;
  content: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyApprovalDraft(): ApprovalDraft {
  return {
    sourceKey: "manual",
    externalRecordId: "",
    externalUrl: "",
    statusSnapshot: "approved",
    approvedOn: today(),
    note: "",
  };
}

function emptyRecordDraft(): RecordDraft {
  return { recordType: "filing", occurredOn: today(), title: "", content: "" };
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || `${fallback} (${response.status})`;
}

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function optimizationLabel(attachment: ContractAttachment) {
  if (attachment.optimizationStatus === "optimized") {
    const saved = Math.max(0, Math.round((attachment.compressionSavingsRatio ?? 0) * 100));
    return `PDF 已压缩${saved ? ` ${saved}%` : ""}`;
  }
  if (attachment.optimizationStatus === "retained_original") return "PDF 无有效压缩收益";
  if (attachment.optimizationStatus === "failed") return "PDF 压缩失败，原件可用";
  return "原件";
}

function approvalFields(input: {
  draft: ApprovalDraft;
  disabled: boolean;
  update: (patch: Partial<ApprovalDraft>) => void;
}): FormSurfaceItemSpec[] {
  const state = input.disabled ? "disabled" as const : "required" as const;
  return [
    {
      key: "approvalSourceKey",
      label: "审批来源",
      value: input.draft.sourceKey,
      spec: { valueType: "string", control: "text", state },
      onChange: (value) => input.update({ sourceKey: String(value ?? "") }),
    },
    {
      key: "approvalRecordId",
      label: "审批记录编号",
      value: input.draft.externalRecordId,
      spec: { valueType: "string", control: "text", state },
      onChange: (value) => input.update({ externalRecordId: String(value ?? "") }),
    },
    {
      key: "approvedOn",
      label: "审批通过日期",
      value: input.draft.approvedOn,
      spec: { valueType: "date", control: "date", state },
      onChange: (value) => input.update({ approvedOn: String(value ?? "") }),
    },
    {
      key: "approvalStatusSnapshot",
      label: "结果快照",
      value: input.draft.statusSnapshot,
      spec: { valueType: "string", control: "text", state: input.disabled ? "disabled" : "normal" },
      onChange: (value) => input.update({ statusSnapshot: String(value ?? "") }),
    },
    {
      key: "approvalRecordUrl",
      label: "审批记录链接",
      value: input.draft.externalUrl,
      span: "wide",
      spec: { valueType: "string", control: "text", state: input.disabled ? "disabled" : "normal" },
      onChange: (value) => input.update({ externalUrl: String(value ?? "") }),
    },
    {
      key: "approvalNote",
      label: "说明",
      value: input.draft.note,
      span: "wide",
      spec: { valueType: "string", control: "text", multiline: true, state: input.disabled ? "disabled" : "normal" },
      rows: 2,
      autoGrow: true,
      onChange: (value) => input.update({ note: String(value ?? "") }),
    },
  ];
}

export function useContractArchivePackage(input: {
  contractId: number | null;
  contractVersion: number | null;
  lifecycleStatus: Contract["lifecycleStatus"] | null;
  canUpdate: boolean;
  onContractVersionChange: (version: number, approval: ApprovalDraft, syncedAt: string | null) => void;
}) {
  const feedback = useFeedback();
  const [archivePackage, setArchivePackage] = useState<ContractArchivePackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<"approval" | "attachments" | "records" | null>("attachments");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<ContractAttachmentKind>("signed_contract");
  const [attachmentNote, setAttachmentNote] = useState("");
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft>(emptyApprovalDraft);
  const [recordDraft, setRecordDraft] = useState<RecordDraft>(emptyRecordDraft);
  const [busy, setBusy] = useState<"attachment" | "approval" | "record" | string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!input.contractId) {
      setArchivePackage(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${input.contractId}/package`), {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(await responseError(response, "合同材料加载失败"));
      const body = await response.json() as ContractArchivePackage;
      setArchivePackage(body);
      if (body.approvalReference) {
        setApprovalDraft({
          sourceKey: body.approvalReference.sourceKey,
          externalRecordId: body.approvalReference.externalRecordId,
          externalUrl: body.approvalReference.externalUrl ?? "",
          statusSnapshot: body.approvalReference.statusSnapshot ?? "",
          approvedOn: body.approvalReference.approvedOn,
          note: "",
        });
      } else {
        setApprovalDraft(emptyApprovalDraft());
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      feedback.error(error instanceof Error ? error.message : "合同材料加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [feedback, input.contractId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function uploadAttachment() {
    if (!input.contractId || !attachmentFile || !input.canUpdate) return;
    setBusy("attachment");
    try {
      const body = new FormData();
      body.append("file", attachmentFile, attachmentFile.name);
      body.append("kind", attachmentKind);
      if (attachmentNote.trim()) body.append("note", attachmentNote.trim());
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${input.contractId}/attachments`), {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error(await responseError(response, "附件上传失败"));
      setAttachmentFile(null);
      setAttachmentNote("");
      feedback.success("合同附件已归档");
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "附件上传失败");
    } finally {
      setBusy(null);
    }
  }

  async function saveApprovalReference() {
    if (!input.contractId || !input.contractVersion || !input.canUpdate) return;
    setBusy("approval");
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${input.contractId}/approval-reference`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": String(input.contractVersion) },
        body: JSON.stringify({
          ...approvalDraft,
          externalUrl: approvalDraft.externalUrl.trim() || undefined,
          statusSnapshot: approvalDraft.statusSnapshot.trim() || undefined,
          note: approvalDraft.note.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "审批记录保存失败"));
      const body = await response.json() as { version: number; syncedAt: string | null };
      input.onContractVersionChange(body.version, approvalDraft, body.syncedAt);
      feedback.success("审批记录已登记");
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "审批记录保存失败");
    } finally {
      setBusy(null);
    }
  }

  async function createRecord() {
    if (!input.contractId || !input.canUpdate) return;
    setBusy("record");
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${input.contractId}/records`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordDraft),
      });
      if (!response.ok) throw new Error(await responseError(response, "归档记录新增失败"));
      setRecordDraft(emptyRecordDraft());
      feedback.success("归档记录已新增");
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "归档记录新增失败");
    } finally {
      setBusy(null);
    }
  }

  function downloadAttachment(attachmentUid: string, variant: "optimized" | "original") {
    if (!input.contractId) return;
    const link = document.createElement("a");
    link.href = workspacePath(`/api/modules/administration/contracts/${input.contractId}/attachments/${attachmentUid}/download?variant=${variant}`);
    link.click();
  }

  async function removeAttachment(attachment: ContractAttachment) {
    if (!input.contractId || !input.canUpdate) return;
    const confirmed = await feedback.confirm({
      title: "移除合同附件",
      message: `确定移除“${attachment.fileName}”吗？原件仍保留在审计存储中。`,
      confirmLabel: "移除",
    });
    if (!confirmed) return;
    setBusy(attachment.attachmentUid);
    try {
      const response = await fetch(workspacePath(`/api/modules/administration/contracts/${input.contractId}/attachments/${attachment.attachmentUid}/remove`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "用户从合同材料包移除" }),
      });
      if (!response.ok) throw new Error(await responseError(response, "附件移除失败"));
      feedback.success("附件已移除并保留记录");
      await refresh();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "附件移除失败");
    } finally {
      setBusy(null);
    }
  }

  const sections: BodySurfaceSectionSpec[] = (() => {
    if (!input.contractId) return [];
    if (loading) return [createMessageSection("contract-package-loading", { tone: "muted", content: "正在加载合同材料..." })];
    const editable = input.canUpdate && input.lifecycleStatus !== "draft";
    const attachmentItems: FormSurfaceItemSpec[] = (archivePackage?.attachments ?? []).map((attachment) => ({
      key: `attachment-${attachment.attachmentUid}`,
      label: contractOptionLabel(CONTRACT_ATTACHMENT_KIND_OPTIONS, attachment.kind),
      value: [
        attachment.removedAt ? "已移除" : attachment.fileName,
        fileSize(attachment.originalSizeBytes),
        optimizationLabel(attachment),
        attachment.uploadedByName,
      ].filter(Boolean).join(" · "),
      span: "wide",
      spec: { valueType: "string", control: "text", state: "readonly" },
      actions: [
        { key: `download-${attachment.attachmentUid}`, label: "下载", icon: "download", onClick: () => downloadAttachment(attachment.attachmentUid, "optimized") },
        { key: `original-${attachment.attachmentUid}`, label: "下载原件", icon: "download", onClick: () => downloadAttachment(attachment.attachmentUid, "original") },
        ...(!editable || attachment.removedAt ? [] : [{
          key: `remove-${attachment.attachmentUid}`,
          label: "移除",
          icon: "delete" as const,
          variant: "danger" as const,
          disabled: busy === attachment.attachmentUid,
          onClick: () => void removeAttachment(attachment),
        }]),
      ],
    }));
    const recordItems: FormSurfaceItemSpec[] = (archivePackage?.records ?? []).map((record) => ({
      key: `record-${record.recordUid}`,
      label: record.occurredOn,
      value: [record.title, record.content, record.createdByName].filter(Boolean).join(" · "),
      span: "wide",
      spec: { valueType: "string", control: "text", state: "readonly" },
    }));
    return [
      createPanelSection("contract-approval-reference", {
        title: "审批记录引用",
        disclosure: { expanded: expanded === "approval", onExpandedChange: (open) => setExpanded(open ? "approval" : null) },
        sections: [createSectionsSection("contract-approval-content", {
          sections: [createFieldsSection("contract-approval-fields", approvalFields({
            draft: approvalDraft,
            disabled: !editable || busy === "approval",
            update: (patch) => setApprovalDraft((current) => ({ ...current, ...patch })),
          }), {
            header: { title: "审批引用登记" },
            layout: { columns: 2 },
            actions: editable ? [{
              key: "save-approval-reference",
              action: "save",
              label: busy === "approval" ? "保存中..." : "保存审批记录",
              disabled: busy !== null || !approvalDraft.sourceKey || !approvalDraft.externalRecordId || !approvalDraft.approvedOn,
              onClick: () => void saveApprovalReference(),
            }] : [],
          })],
        })],
      }),
      createPanelSection("contract-attachments", {
        title: `合同附件（${archivePackage?.attachments.filter((item) => !item.removedAt).length ?? 0}）`,
        disclosure: { expanded: expanded === "attachments", onExpandedChange: (open) => setExpanded(open ? "attachments" : null) },
        sections: [createSectionsSection("contract-attachments-content", {
          sections: [
            ...(!editable ? [] : [createFieldsSection("contract-attachment-upload", [
              {
                key: "contractAttachmentFile",
                label: "选择附件",
                hint: "PDF 自动生成压缩版，原件保持不变",
                accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.ppt,.pptx,.png,.jpg,.jpeg,.webp",
                span: "wide",
                spec: { valueType: "file", control: "file", state: busy === "attachment" ? "disabled" : "required" },
                onChange: (value) => setAttachmentFile(value instanceof File ? value : null),
              },
              {
                key: "contractAttachmentKind",
                label: "附件类型",
                value: attachmentKind,
                spec: { valueType: "string", control: "choice", state: busy === "attachment" ? "disabled" : "required", options: { source: "static", items: [...CONTRACT_ATTACHMENT_KIND_OPTIONS] } },
                onChange: (value) => setAttachmentKind(String(value) as ContractAttachmentKind),
              },
              {
                key: "contractAttachmentNote",
                label: "说明",
                value: attachmentNote,
                span: "wide",
                spec: { valueType: "string", control: "text", multiline: true, state: busy === "attachment" ? "disabled" : "normal" },
                rows: 2,
                onChange: (value) => setAttachmentNote(String(value ?? "")),
              },
            ], {
              header: { title: "上传附件" },
              layout: { columns: 2 },
              actions: [{
                key: "upload-contract-attachment",
                action: "save",
                label: busy === "attachment" ? "处理中..." : "上传并归档",
                disabled: busy !== null || !attachmentFile,
                onClick: () => void uploadAttachment(),
              }],
            })]),
            ...(attachmentItems.length ? [createFieldsSection("contract-attachment-list", attachmentItems)] : [createMessageSection("contract-attachment-empty", { tone: "muted", content: editable ? "还没有合同附件。" : "当前合同没有附件。" })]),
          ],
        })],
      }),
      createPanelSection("contract-records", {
        title: `归档记录（${archivePackage?.records.length ?? 0}）`,
        disclosure: { expanded: expanded === "records", onExpandedChange: (open) => setExpanded(open ? "records" : null) },
        sections: [createSectionsSection("contract-records-content", {
          sections: [
            ...(!editable ? [] : [createFieldsSection("contract-record-create", [
              {
                key: "contractRecordType",
                label: "记录类型",
                value: recordDraft.recordType,
                spec: { valueType: "string", control: "choice", state: busy === "record" ? "disabled" : "required", options: { source: "static", items: [...CONTRACT_RECORD_TYPE_OPTIONS] } },
                onChange: (value) => setRecordDraft((current) => ({ ...current, recordType: String(value) as ContractRecordInputType })),
              },
              {
                key: "contractRecordOccurredOn",
                label: "发生日期",
                value: recordDraft.occurredOn,
                spec: { valueType: "date", control: "date", state: busy === "record" ? "disabled" : "required" },
                onChange: (value) => setRecordDraft((current) => ({ ...current, occurredOn: String(value ?? "") })),
              },
              {
                key: "contractRecordTitle",
                label: "记录标题",
                value: recordDraft.title,
                span: "wide",
                spec: { valueType: "string", control: "text", state: busy === "record" ? "disabled" : "required" },
                onChange: (value) => setRecordDraft((current) => ({ ...current, title: String(value ?? "") })),
              },
              {
                key: "contractRecordContent",
                label: "记录内容",
                value: recordDraft.content,
                span: "wide",
                spec: { valueType: "string", control: "text", multiline: true, state: busy === "record" ? "disabled" : "normal" },
                rows: 2,
                autoGrow: true,
                onChange: (value) => setRecordDraft((current) => ({ ...current, content: String(value ?? "") })),
              },
            ], {
              header: { title: "新增归档记录" },
              layout: { columns: 2 },
              actions: [{
                key: "create-contract-record",
                action: "save",
                label: busy === "record" ? "保存中..." : "新增记录",
                disabled: busy !== null || !recordDraft.title || !recordDraft.occurredOn,
                onClick: () => void createRecord(),
              }],
            })]),
            ...(recordItems.length ? [createFieldsSection("contract-record-list", recordItems)] : [createMessageSection("contract-record-empty", { tone: "muted", content: "还没有归档记录。" })]),
          ],
        })],
      }),
    ];
  })();

  return { sections };
}
