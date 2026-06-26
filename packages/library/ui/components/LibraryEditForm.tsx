import { FormSurface } from "@workspace/core/ui";
import type { LibraryDocumentItem } from "@workspace/library/types";

interface Props {
  doc: LibraryDocumentItem;
  form: Partial<LibraryDocumentItem>;
  setForm: (updater: (prev: Partial<LibraryDocumentItem>) => Partial<LibraryDocumentItem>) => void;
  canWrite?: boolean;
  canAdmin?: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "正常" },
  { value: "missing", label: "缺失" },
  { value: "archived", label: "归档" },
  { value: "draft", label: "草稿" },
];

const CONFIDENTIALITY_OPTIONS = [
  { value: "0", label: "公开" },
  { value: "1", label: "内部" },
  { value: "2", label: "普通" },
  { value: "3", label: "机密" },
  { value: "4", label: "绝密" },
];

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
    <FormSurface
      kind="fields"
      className="space-y-1"
      fields={[
        {
          key: "docId",
          label: "文档编号（docId）",
          hint: "改名后仍可通过此编号找到文档",
          spec: { valueType: "string", editor: "input", state: !canWrite ? "disabled" : "normal" },
          value: form.docId !== undefined ? (form.docId ?? "") : (doc.docId ?? ""),
          onChange: (value) => setForm((f) => ({ ...f, docId: String(value ?? "") })),
          placeholder: "如 DOC-2024-001",
        },
        {
          key: "title",
          label: "标题",
          spec: { valueType: "string", editor: "input", state: !canWrite ? "disabled" : "normal" },
          value: form.title ?? doc.title ?? "",
          onChange: (value) => setForm((f) => ({ ...f, title: String(value ?? "") })),
        },
        {
          key: "summary",
          label: "简介",
          spec: { valueType: "string", editor: "textarea", state: !canWrite ? "disabled" : "normal" },
          value: form.summary ?? doc.summary ?? "",
          onChange: (value) => setForm((f) => ({ ...f, summary: String(value ?? "") })),
          rows: 3,
        },
        {
          key: "tags",
          label: "标签（用逗号分隔）",
          spec: { valueType: "string", editor: "input", state: !canWrite ? "disabled" : "normal" },
          value: tagsValue.join(", "),
          onChange: (value) => handleTagInput(String(value ?? "")),
          placeholder: "如 年度报表, 已审计, 研发",
        },
        {
          key: "categoryCode",
          label: "分类编码",
          spec: { valueType: "string", editor: "input", state: !canWrite ? "disabled" : "normal" },
          value: form.categoryCode ?? doc.categoryCode ?? "",
          onChange: (value) => setForm((f) => ({ ...f, categoryCode: String(value ?? "") })),
        },
        {
          key: "categoryName",
          label: "分类名称",
          spec: { valueType: "string", editor: "input", state: !canWrite ? "disabled" : "normal" },
          value: form.categoryName ?? doc.categoryName ?? "",
          onChange: (value) => setForm((f) => ({ ...f, categoryName: String(value ?? "") })),
        },
        {
          key: "confidentialityLevel",
          label: "保密等级",
          hint: !canAdmin ? "需要管理权限才能修改保密等级" : undefined,
          spec: {
            valueType: "number",
            editor: "select",
            state: !canAdmin ? "disabled" : "normal",
            options: { source: "static", mode: "dropdown", items: CONFIDENTIALITY_OPTIONS },
          },
          value: String(form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel),
          onChange: (value) => setForm((f) => ({ ...f, confidentialityLevel: parseInt(String(value), 10) })),
        },
        {
          key: "status",
          label: "状态",
          spec: {
            valueType: "string",
            editor: "select",
            state: !canWrite ? "disabled" : "normal",
            options: { source: "static", mode: "dropdown", items: STATUS_OPTIONS },
          },
          value: form.status !== undefined ? form.status : doc.status,
          onChange: (value) => setForm((f) => ({ ...f, status: String(value ?? "") })),
        },
      ]}
    />
  );
}
