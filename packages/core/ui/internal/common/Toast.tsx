"use client";

import { useEffect } from "react";
import { App } from "antd";
import ConfirmModal from "./ConfirmModal";

const toastKey = "workspace-feedback-toast";

export interface ToastProps {
  message: string;
  type?: "success" | "error";
  show: boolean;
  onClose: () => void;
  duration?: number;
  title?: string;
}

export default function Toast({
  message,
  type = "success",
  show,
  onClose,
  duration = 2000,
  title,
}: ToastProps) {
  const { message: messageApi } = App.useApp();

  useEffect(() => {
    if (!show || type === "error") return;
    messageApi.success({
      content: message,
      duration: duration / 1000,
      key: toastKey,
      onClose,
    });
  }, [duration, message, messageApi, onClose, show, type]);

  if (!show) return null;

  if (type === "error") {
    return (
      <ConfirmModal
        open
        title={title ?? "操作失败"}
        message={message}
        confirmLabel="关闭"
        showCancel={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  return null;
}
