import { createFieldsSection, createPageBody, PageSurface } from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";
import {
  LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS,
  LIBRARY_DOCUMENT_STATUS_OPTIONS,
} from "./library-document-options";

interface Props {
  doc: LibraryDocumentItem;
  form: Partial<LibraryDocumentItem>;
  setForm: (updater: (prev: Partial<LibraryDocumentItem>) => Partial<LibraryDocumentItem>) => void;
  canWrite?: boolean;
  canAdmin?: boolean;
}

export default function LibraryEditForm({ doc, form, setForm, canWrite, canAdmin }: Props) {
  const tagsValue = form.tags !== undefined
    ? form.tags
    : (doc.tags ?? []);

  const handleTagInput = (raw: string) => {
    const tags = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    setForm((f) => ({ ...f, tags }));
  };

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([
        createFieldsSection("library-edit", [
          {
            key: "docId",
            label: "文档编号（docId）",
            hint: "改名后仍可通过此编号找到文档",
            spec: { valueType: "string", control: "text", state: !canWrite ? "disabled" : "normal" },
            value: form.docId !== undefined ? (form.docId ?? "") : (doc.docId ?? ""),
            onChange: (value) => setForm((f) => ({ ...f, docId: String(value ?? "") })),
            placeholder: "如 DOC-2024-001",
          },
          {
            key: "title",
            label: "标题",
            spec: { valueType: "string", control: "text", state: !canWrite ? "disabled" : "normal" },
            value: form.title ?? doc.title ?? "",
            onChange: (value) => setForm((f) => ({ ...f, title: String(value ?? "") })),
          },
          {
            key: "summary",
            label: "简介",
            spec: { valueType: "string", control: "text", multiline: true, state: !canWrite ? "disabled" : "normal" },
            value: form.summary ?? doc.summary ?? "",
            onChange: (value) => setForm((f) => ({ ...f, summary: String(value ?? "") })),
            rows: 3,
          },
          {
            key: "tags",
            label: "标签（用逗号分隔）",
            spec: { valueType: "string", control: "text", state: !canWrite ? "disabled" : "normal" },
            value: tagsValue.join(", "),
            onChange: (value) => handleTagInput(String(value ?? "")),
            placeholder: "如 年度报表, 已审计, 研发",
          },
          {
            key: "categoryCode",
            label: "分类编码",
            spec: { valueType: "string", control: "text", state: !canWrite ? "disabled" : "normal" },
            value: form.categoryCode ?? doc.categoryCode ?? "",
            onChange: (value) => setForm((f) => ({ ...f, categoryCode: String(value ?? "") })),
          },
          {
            key: "categoryName",
            label: "分类名称",
            spec: { valueType: "string", control: "text", state: !canWrite ? "disabled" : "normal" },
            value: form.categoryName ?? doc.categoryName ?? "",
            onChange: (value) => setForm((f) => ({ ...f, categoryName: String(value ?? "") })),
          },
          {
            key: "confidentialityLevel",
            label: "保密等级",
            hint: !canAdmin ? "需要管理权限才能修改保密等级" : undefined,
            spec: {
              valueType: "number",
              control: "choice",
              state: !canAdmin ? "disabled" : "normal",
              options: { source: "static", mode: "dropdown", items: LIBRARY_DOCUMENT_CONFIDENTIALITY_FIELD_OPTIONS },
            },
            value: String(form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel),
            onChange: (value) => setForm((f) => ({ ...f, confidentialityLevel: parseInt(String(value), 10) })),
          },
          {
            key: "status",
            label: "状态",
            spec: {
              valueType: "string",
              control: "choice",
              state: !canWrite ? "disabled" : "normal",
              options: { source: "static", mode: "dropdown", items: LIBRARY_DOCUMENT_STATUS_OPTIONS },
            },
            value: form.status !== undefined ? form.status : doc.status,
            onChange: (value) => setForm((f) => ({ ...f, status: String(value ?? "") })),
          },
        ], {  }),
      ])}
    />
  );
}
