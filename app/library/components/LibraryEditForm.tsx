import type { LibraryDocumentItem } from "../types";

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
  { value: 0, label: "公开" },
  { value: 1, label: "内部" },
  { value: 2, label: "普通" },
  { value: 3, label: "机密" },
  { value: 4, label: "绝密" },
];

export default function LibraryEditForm({ doc, form, setForm, canWrite, canAdmin }: Props) {
  return (
    <div className="space-y-1">
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">标题</label>
        <input
          type="text"
          value={form.title ?? doc.title ?? ""}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        />
      </div>
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">简介</label>
        <textarea
          value={form.summary ?? doc.summary ?? ""}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        />
      </div>
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">分类编码</label>
        <input
          type="text"
          value={form.categoryCode ?? doc.categoryCode ?? ""}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        />
      </div>
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">分类名称</label>
        <input
          type="text"
          value={form.categoryName ?? doc.categoryName ?? ""}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, categoryName: e.target.value }))}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        />
      </div>
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">保密等级</label>
        <select
          value={form.confidentialityLevel !== undefined ? form.confidentialityLevel : doc.confidentialityLevel}
          disabled={!canAdmin}
          onChange={(e) => setForm((f) => ({ ...f, confidentialityLevel: parseInt(e.target.value, 10) }))}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        >
          {CONFIDENTIALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {!canAdmin && (
          <p className="text-xs text-gray-400 mt-1">需要管理权限才能修改保密等级</p>
        )}
      </div>
      <div className="py-2">
        <label className="text-xs text-gray-400 block mb-1">状态</label>
        <select
          value={form.status !== undefined ? form.status : doc.status}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-50"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
