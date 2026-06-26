"use client";

import { useState } from "react";
import { CreatePanel, FormField, SelectField, TextField } from "@workspace/core/ui";

export function CreatePanelPreview() {
  const [variant, setVariant] = useState<"inline" | "block" | "modal" | "detail">("inline");
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const formContent = (
    <>
      <FormField label="名称" required>
        <TextField value={name} onChange={setName} placeholder="输入名称" />
      </FormField>
      <FormField label="类型">
        <SelectField value="" onChange={() => {}} options={[{ value: "", label: "请选择" }, { value: "a", label: "类型 A" }, { value: "b", label: "类型 B" }]} />
      </FormField>
    </>
  );
  const detailDirty = !creating && name !== savedName;
  const btn = (v: typeof variant) => (
    <button
      key={v}
      type="button"
      onClick={() => setVariant(v)}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${variant === v ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {v}
    </button>
  );
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">{(["inline", "block", "modal", "detail"] as const).map(btn)}</div>
      {variant === "block" && <CreatePanel variant="block" title="新增项目阶段" creating={creating} canCreate onStartCreate={() => setCreating(true)} onSubmit={() => setCreating(false)} onCancel={() => setCreating(false)} createContent={formContent}><p className="text-xs text-slate-400">非创建态下展示列表占位。</p></CreatePanel>}
      {variant === "inline" && <CreatePanel variant="inline" title="新增员工" onSubmit={() => {}} onCancel={() => setName("")}>{formContent}</CreatePanel>}
      {variant === "modal" && (
        <>
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">打开弹窗新建</button>
          <CreatePanel variant="modal" title="弹窗新建" open={open} onSubmit={() => setOpen(false)} onCancel={() => setOpen(false)}>{formContent}</CreatePanel>
        </>
      )}
      {variant === "detail" && (
        <CreatePanel
          variant="detail"
          title="项目详情"
          createTitle="新建项目"
          creating={creating}
          canCreate
          onStartCreate={() => setCreating(true)}
          onSubmit={() => { setCreating(false); setSavedName(name); }}
          onCancel={() => { setCreating(false); setName(savedName); }}
          dirty={detailDirty}
          onSave={() => { setDetailSaving(true); setTimeout(() => { setDetailSaving(false); setSavedName(name); }, 600); }}
          canSave={name.trim().length > 0}
          saveLabel="保存"
          onDelete={() => { setName(""); setSavedName(""); }}
          canDelete={!detailSaving}
          deleteLabel="删除"
          submitting={detailSaving}
          submitLabel="创建"
          createContent={formContent}
        >
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{savedName || "（未命名）"}</p>
            <p className="text-xs text-slate-400">非创建态右侧详情内容占位。编辑名称以触发未保存提示。</p>
            <TextField value={name} onChange={setName} placeholder="修改名称触发 dirty" className="max-w-xs" />
          </div>
        </CreatePanel>
      )}
    </div>
  );
}
