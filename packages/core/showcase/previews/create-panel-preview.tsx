"use client";

import { useState } from "react";
import { CreatePanel, FormField, SelectField, TextField } from "../internal-ui";

export function CreatePanelPreview() {
  const [variant, setVariant] = useState<"inline" | "block" | "block-modal">("inline");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
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
      <div className="flex flex-wrap items-center gap-2">{(["inline", "block", "block-modal"] as const).map(btn)}</div>
      {variant === "block" && <CreatePanel variant="block" title="新增项目阶段" creating={creating} canCreate onStartCreate={() => setCreating(true)} onSubmit={() => setCreating(false)} onCancel={() => setCreating(false)} createContent={formContent}><p className="text-xs text-slate-400">非创建态下展示列表占位。</p></CreatePanel>}
      {variant === "inline" && <CreatePanel variant="inline" title="新增员工" onSubmit={() => {}} onCancel={() => setName("")}>{formContent}</CreatePanel>}
      {variant === "block-modal" && <CreatePanel variant="block" presentation="modal" title="弹窗新建" creating={creating} canCreate onStartCreate={() => setCreating(true)} onSubmit={() => setCreating(false)} onCancel={() => setCreating(false)} createContent={formContent}><p className="text-xs text-slate-400">非创建态下展示列表占位。</p></CreatePanel>}
    </div>
  );
}
