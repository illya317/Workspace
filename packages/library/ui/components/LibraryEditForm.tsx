import { FormField, SelectField, TextareaField, TextField } from "@workspace/core/ui";
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
    <div className="space-y-1">
      <FormField label="文档编号（docId）" hint="改名后仍可通过此编号找到文档">
        <TextField
          value={form.docId !== undefined ? (form.docId ?? "") : (doc.docId ?? "")}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, docId: value }))}
          placeholder="如 DOC-2024-001"
        />
      </FormField>
      <FormField label="标题">
        <TextField
          value={form.title ?? doc.title ?? ""}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, title: value }))}
        />
      </FormField>
      <FormField label="简介">
        <TextareaField
          value={form.summary ?? doc.summary ?? ""}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, summary: value }))}
          rows={3}
        />
      </FormField>
      <FormField label="标签（用逗号分隔）">
        <TextField
          value={tagsValue.join(", ")}
          disabled={!canWrite}
          onChange={handleTagInput}
          placeholder="如 年度报表, 已审计, 研发"
        />
      </FormField>
      <FormField label="分类编码">
        <TextField
          value={form.categoryCode ?? doc.categoryCode ?? ""}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, categoryCode: value }))}
        />
      </FormField>
      <FormField label="分类名称">
        <TextField
          value={form.categoryName ?? doc.categoryName ?? ""}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, categoryName: value }))}
        />
      </FormField>
      <div className="py-2">
        <SelectField
          label="保密等级"
          value={String(form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel)}
          disabled={!canAdmin}
          onChange={(value) => setForm((f) => ({ ...f, confidentialityLevel: parseInt(value, 10) }))}
          options={CONFIDENTIALITY_OPTIONS}


        />
        {!canAdmin && (
          <p className="text-xs text-gray-400 mt-1">需要管理权限才能修改保密等级</p>
        )}
      </div>
      <div className="py-2">
        <SelectField
          label="状态"
          value={form.status !== undefined ? form.status : doc.status}
          disabled={!canWrite}
          onChange={(value) => setForm((f) => ({ ...f, status: value }))}
          options={STATUS_OPTIONS}


        />
      </div>
    </div>
  );
}
