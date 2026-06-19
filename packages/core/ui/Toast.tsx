"use client";

import { useEffect } from "react";

export interface ToastProps {
  message: string;
  type?: "success" | "error";
  show: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({
  message,
  type = "success",
  show,
  onClose,
  duration = 2000,
}: ToastProps) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [show, onClose, duration]);

  if (!show) return null;

  return (
    <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
      <div
        className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
          type === "error" ? "bg-red-500" : "bg-emerald-600"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
