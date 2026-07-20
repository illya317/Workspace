"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export interface DetailModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export default function DetailModal({
  open,
  title,
  onClose,
  children,
  footer,
  maxWidth = "max-w-lg",
}: DetailModalProps) {
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 sm:p-4">
      <div className="flex min-h-full items-end justify-center sm:items-center">
        <div className={`max-h-[100dvh] w-full ${maxWidth} overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <button type="button" aria-label="关闭" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-slate-100 hover:text-gray-600 sm:h-9 sm:w-9">
              ✕
            </button>
          </div>
          {children}
          {footer ? <div className="mt-4 border-t border-slate-200 pt-4">{footer}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
