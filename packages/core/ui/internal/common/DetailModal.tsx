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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className={`w-full ${maxWidth} overflow-visible rounded-lg bg-white p-6 shadow-xl`}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
