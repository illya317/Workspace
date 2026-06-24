"use client";

import { useState } from "react";
import {
  ActionButton,
  ActionGlyph,
  ConfirmProvider,
  IconActionButton,
  SearchableOptionInput,
  TagRemoveButton,
} from "@workspace/core/ui";

function ShowcaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

function Showcase() {
  const [searchValue, setSearchValue] = useState<string | null>("option-a");

  return (
    <main className="min-h-screen space-y-6 bg-slate-50 p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">UI 组件临时展示页</h1>
        <p className="text-xs text-slate-500">用于 review × 清除/删除按钮等核心组件的样式差异</p>
      </div>

      <ShowcaseSection title="ActionGlyph（图标型）">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          kind=&quot;x&quot;:
          <ActionGlyph kind="x" className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          kind=&quot;delete&quot;:
          <ActionGlyph kind="delete" />
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="TagRemoveButton（core primitive，带二次确认）">
        <TagRemoveButton label="删除标签示例" confirm={false} onClick={() => {}} />
        <TagRemoveButton label="删除标签示例" confirm={false} onClick={() => {}} disabled />
      </ShowcaseSection>

      <ShowcaseSection title="IconActionButton + ×（NotificationBell 当前用法）">
        <IconActionButton
          label="清除通知"
          className="!size-6 !rounded-full !border-0 !bg-transparent !text-lg !leading-none !text-slate-300 hover:!bg-slate-100 hover:!text-slate-600"
          onClick={() => {}}
        >
          ×
        </IconActionButton>
        <IconActionButton
          label="清除通知"
          className="!size-6 !rounded-full !border-0 !bg-transparent !text-lg !leading-none !text-slate-300 hover:!bg-slate-100 hover:!text-slate-600 disabled:!text-slate-200"
          disabled
          onClick={() => {}}
        >
          ×
        </IconActionButton>
      </ShowcaseSection>

      <ShowcaseSection title="ActionButton + ×（InlineFeedbackEditor / detail-editor 当前用法）">
        <ActionButton className="px-2 py-1" onClick={() => {}} aria-label="关闭字段反馈">
          ×
        </ActionButton>
        <ActionButton
          aria-label="删除工作区域"
          onClick={() => {}}
          variant="danger"
          className="grid size-9 place-items-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none hover:bg-red-50 hover:text-red-500"
        >
          ×
        </ActionButton>
      </ShowcaseSection>

      <ShowcaseSection title="SearchableOptionInput 清除按钮（手写）">
        <SearchableOptionInput
          value={searchValue}
          options={[
            { value: "option-a", label: "选项 A" },
            { value: "option-b", label: "选项 B" },
          ]}
          onChange={setSearchValue}
          placeholder="选择或输入…"
          className="w-64"
        />
      </ShowcaseSection>
    </main>
  );
}

export default function UiShowcasePage() {
  return (
    <ConfirmProvider>
      <Showcase />
    </ConfirmProvider>
  );
}
