"use client";

import type { ReactNode } from "react";
import { Modal } from "antd";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  showCancel?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  confirmDanger = true,
  showCancel = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal
      cancelButtonProps={{ disabled: busy, hidden: !showCancel }}
      cancelText={cancelLabel}
      centered
      closable={!busy}
      confirmLoading={busy}
      destroyOnHidden
      keyboard={!busy}
      mask={{ closable: !busy }}
      okButtonProps={{ danger: confirmDanger, disabled: busy }}
      okText={confirmLabel}
      onCancel={onCancel}
      onOk={onConfirm}
      open={open}
      title={title}
      width={440}
    >
      <div className="py-1 text-sm leading-6 text-slate-600">{message}</div>
    </Modal>
  );
}
