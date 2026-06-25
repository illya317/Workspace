"use client";

import { useState, type FC } from "react";
import {
  ActionButton,
  ConfirmModal,
  ConfirmProvider,
  DetailModal,
  DropdownMenu,
  ModalCreatePanel,
  useConfirm,
} from "@workspace/core/ui";

function ConfirmModalPreview() {
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  return (
    <>
      <ActionButton kind="delete-bin" label="打开确认弹窗" variant="danger" onClick={() => setConfirmOpen(true)} />
      <ConfirmModal
        open={confirmOpen}
        title="确认删除？"
        message="删除后无法恢复，是否继续？"
        confirmLabel="删除"
        cancelLabel="取消"
        confirmDanger
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function ConfirmProviderPreview() {
  return (
    <ConfirmProvider>
      <ConfirmProviderDemo />
    </ConfirmProvider>
  );
}

function ConfirmProviderDemo() {
  const confirm = useConfirm();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <ActionButton
        kind="check"
        label="触发命令式确认"
        onClick={async () => {
          const ok = await confirm({ title: "请确认", message: "是否执行该操作？", confirmLabel: "执行" });
          setResult(ok ? "已确认" : "已取消");
        }}
      />
      {result && <span className="text-xs text-slate-500">结果：{result}</span>}
    </div>
  );
}

function DetailModalPreview() {
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  return (
    <>
      <ActionButton kind="view" label="打开详情弹窗" variant="secondary" onClick={() => setDetailOpen(true)} />
      <DetailModal
        open={detailOpen}
        title="记录详情"
        onClose={() => setDetailOpen(false)}
      >
        <div className="space-y-3 text-sm text-slate-600">
          <p>这里是详情内容区域。</p>
          <p>可以放置字段、说明或任何子元素。</p>
        </div>
      </DetailModal>
    </>
  );
}

function DropdownMenuPreview() {
  return (
    <DropdownMenu
      trigger={<span className="text-sm">更多操作</span>}
      items={[
        { label: "查看详情", onSelect: () => {} },
        { label: "编辑", onSelect: () => {} },
        { separatorBefore: true, label: "删除", tone: "danger", onSelect: () => {} },
      ]}
      align="left"
      ariaLabel="示例下拉菜单"
    />
  );
}

function useUnsavedChangesPromptPreview() {
  return (
    <div className="text-xs text-slate-400">
      <p className="font-medium">useUnsavedChangesPrompt</p>
      <p>未保存离开确认 hook，统一保存按钮 dirty 状态下的离开提醒和 beforeunload 拦截。</p>
      <p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p>
    </div>
  );
}

function ModalCreatePanelPreview() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <>
      <ActionButton kind="add" label="打开弹窗新建面板" onClick={() => setOpen(true)} />
      <ModalCreatePanel
        open={open}
        title="新建合同"
        onSubmit={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        submitDisabled={!name}
      >
        <div className="space-y-4 md:col-span-2">
          <label className="block text-xs font-semibold text-slate-500">合同名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入合同名称"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </ModalCreatePanel>
    </>
  );
}

export const overlayPreviewByName: Record<string, FC> = {
  ConfirmModal: ConfirmModalPreview,
  ConfirmProvider: ConfirmProviderPreview,
  DetailModal: DetailModalPreview,
  DropdownMenu: DropdownMenuPreview,
  useUnsavedChangesPrompt: useUnsavedChangesPromptPreview,
  ModalCreatePanel: ModalCreatePanelPreview,
};
