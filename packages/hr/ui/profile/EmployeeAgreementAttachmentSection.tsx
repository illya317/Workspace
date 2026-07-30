"use client";

import { useEffect, useState } from "react";

import { workspacePath } from "@workspace/core/routing";
import { type FormSurfaceActionSpec, type FormSurfaceItemSpec, useFeedback } from "@workspace/core/ui";
import type { ContractRow, EmploymentAgreementAttachmentRow } from "@workspace/hr/types";

export function useEmployeeAgreementAttachmentItems(input: {
  employeeId: number;
  agreement: ContractRow | null;
  canEdit: boolean;
  onSaved: () => Promise<void>;
}): { items: FormSurfaceItemSpec[]; actions: FormSurfaceActionSpec[] } {
  const feedback = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const agreementUid = input.agreement?.agreementUid ?? null;

  useEffect(() => {
    setFile(null);
    setNote("");
  }, [agreementUid]);

  if (!input.agreement || !agreementUid) return { items: [], actions: [] };

  async function upload() {
    if (!file || !agreementUid) return;
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      if (note.trim()) body.append("note", note.trim());
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/agreements/${agreementUid}/attachments`), {
        method: "POST",
        body,
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "协议附件上传失败");
      setFile(null);
      setNote("");
      feedback.success("协议附件已上传");
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "协议附件上传失败");
    } finally {
      setBusy(null);
    }
  }

  function download(attachment: EmploymentAgreementAttachmentRow, variant: "optimized" | "original") {
    if (!agreementUid) return;
    const link = document.createElement("a");
    link.href = workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/agreements/${agreementUid}/attachments/${attachment.attachmentUid}/download?variant=${variant}`);
    link.click();
  }

  async function remove(attachment: EmploymentAgreementAttachmentRow) {
    if (!agreementUid) return;
    const confirmed = await feedback.confirm({
      title: "移除协议附件",
      message: `确定移除“${attachment.fileName}”吗？原件仍保留在审计存储中。`,
      confirmLabel: "移除",
    });
    if (!confirmed) return;
    setBusy(attachment.attachmentUid);
    try {
      const response = await fetch(workspacePath(`/api/modules/hr/roster/employee-profiles/${input.employeeId}/agreements/${agreementUid}/attachments/${attachment.attachmentUid}/remove`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "用户从员工协议中移除" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "协议附件移除失败");
      feedback.success("协议附件已移除");
      await input.onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "协议附件移除失败");
    } finally {
      setBusy(null);
    }
  }

  const attachments = input.agreement.attachments;
  const activeCount = attachments.filter((attachment) => !attachment.removedAt).length;
  const sections: FormSurfaceItemSpec[] = [];
  if (input.canEdit) {
    sections.push({
      kind: "section",
      key: "employment-agreement-attachment-upload",
      title: "上传附件",
      layout: { columns: 2 },
      items: [{
        key: "attachmentFile",
        label: "选择附件",
        hint: "支持 PDF、Word 和图片；PDF 自动生成压缩版，原件保持不变",
        accept: ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp",
        span: "wide",
        spec: { valueType: "file", control: "file", state: busy === "upload" ? "disabled" : "normal" },
        onChange: (value) => setFile(value instanceof File ? value : null),
      },
      {
        key: "attachmentNote",
        label: "说明",
        value: note,
        span: "wide",
        spec: { valueType: "string", control: "text", multiline: true, state: busy === "upload" ? "disabled" : "normal" },
        rows: 2,
        onChange: (value) => setNote(String(value ?? "")),
      }],
    });
  }
  if (attachments.length > 0) {
    sections.push({
      kind: "section",
      key: "employment-agreement-attachment-list",
      title: `协议附件（${activeCount}）`,
      items: attachments.map((attachment) => attachmentItem(
        attachment,
        input.canEdit,
        busy,
        download,
        remove,
      )),
    });
  } else {
    sections.push({
      kind: "section",
      key: "employment-agreement-attachment-list",
      title: "协议附件（0）",
      items: [{ kind: "note", key: "employment-agreement-attachment-empty", content: "当前协议没有附件。" }],
    });
  }
  return {
    items: sections,
    actions: input.canEdit ? [{
      key: "upload-employment-agreement-attachment",
      action: "upload",
      label: busy === "upload" ? "压缩处理中..." : "上传附件",
      disabled: busy !== null || !file,
      onClick: () => void upload(),
    }] : [],
  };
}

function attachmentItem(
  attachment: EmploymentAgreementAttachmentRow,
  canEdit: boolean,
  busy: string | null,
  download: (attachment: EmploymentAgreementAttachmentRow, variant: "optimized" | "original") => void,
  remove: (attachment: EmploymentAgreementAttachmentRow) => Promise<void>,
): FormSurfaceItemSpec {
  return {
    key: `attachment-${attachment.attachmentUid}`,
    label: attachment.removedAt ? "已移除" : "附件",
    value: [
      attachment.fileName,
      fileSize(attachment.originalSizeBytes),
      optimizationLabel(attachment),
      attachment.uploadedByName,
    ].filter(Boolean).join(" · "),
    span: "wide",
    spec: { valueType: "string", control: "text", state: "readonly" },
    actions: [
      { key: `download-${attachment.attachmentUid}`, label: "下载", icon: "download", onClick: () => download(attachment, "optimized") },
      ...(attachment.optimizationStatus === "optimized" ? [{ key: `original-${attachment.attachmentUid}`, label: "下载原件", icon: "download" as const, onClick: () => download(attachment, "original") }] : []),
      ...(!canEdit || attachment.removedAt ? [] : [{
        key: `remove-${attachment.attachmentUid}`,
        label: "移除",
        icon: "delete" as const,
        variant: "danger" as const,
        disabled: busy === attachment.attachmentUid,
        onClick: () => void remove(attachment),
      }]),
    ],
  };
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function optimizationLabel(attachment: EmploymentAgreementAttachmentRow) {
  if (attachment.optimizationStatus === "optimized" && attachment.optimizedSizeBytes) {
    return `PDF 已压缩至 ${fileSize(attachment.optimizedSizeBytes)}`;
  }
  if (attachment.optimizationStatus === "retained_original") return "原件已是较小版本";
  if (attachment.optimizationStatus === "failed") return "PDF 压缩失败，保留原件";
  return attachment.pageCount ? `${attachment.pageCount} 页` : null;
}
