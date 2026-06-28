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

export const overlayPreviewByName: Record<string, FC> = {
  ConfirmModal: ConfirmModalPreview,
  DetailModal: DetailModalPreview,
  DropdownMenu: DropdownMenuPreview,
};
