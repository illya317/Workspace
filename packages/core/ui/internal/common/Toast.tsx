"use client";

import { useEffect } from "react";
import ConfirmModal from "./ConfirmModal";

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
  useEffect(() => {
    if (!show || type === "error") return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose, show, type]);

  if (!show) return null;

  if (type === "error") {
    return (
      <ConfirmModal
        open
        title={title ?? "操作失败"}
        message={message}
        confirmLabel="关闭"
        confirmDanger
        showCancel={false}
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fixed left-1/2 top-[max(1.5rem,env(safe-area-inset-top))] z-50 w-[calc(100%-1.5rem)] -translate-x-1/2 sm:w-auto">
      <div className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}
