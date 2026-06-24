"use client";

import { useState, type FC } from "react";
import {
  ActionButton,
  ConfirmModal,
  DetailModal,
  DropdownMenu,
} from "@workspace/core/ui";

function ConfirmModalPreview() {
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  return (
    <>
      <ActionButton variant="danger" onClick={() => setConfirmOpen(true)}>打开确认弹窗</ActionButton>
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
    return <div className="text-xs text-slate-400"><p className="font-medium">ConfirmProvider</p><p>确认弹窗上下文入口，提供命令式 confirm/delete 能力。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function DetailModalPreview() {
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  return (
    <>
      <ActionButton variant="secondary" onClick={() => setDetailOpen(true)}>打开详情弹窗</ActionButton>
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
    return <div className="text-xs text-slate-400"><p className="font-medium">useUnsavedChangesPrompt</p><p>未保存离开确认 hook，统一保存按钮 dirty 状态下的离开提醒和 beforeunload 拦截。</p><p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p></div>;
}

function ModalCreatePanelPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">ModalCreatePanel</p><p>弹窗新建/编辑面板，复用 DetailModal 和统一动作按钮，适合字段较多、不宜内联展开的记录维护。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

export const overlayPreviewByName: Record<string, FC> = {
  ConfirmModal: ConfirmModalPreview,
  ConfirmProvider: ConfirmProviderPreview,
  DetailModal: DetailModalPreview,
  DropdownMenu: DropdownMenuPreview,
  useUnsavedChangesPrompt: useUnsavedChangesPromptPreview,
  ModalCreatePanel: ModalCreatePanelPreview,
};
