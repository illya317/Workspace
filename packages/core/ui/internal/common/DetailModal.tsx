"use client";

import type { ReactNode } from "react";

export interface DetailModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}

export default function DetailModal({
  open,
  title,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: DetailModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-[80vh] w-full ${maxWidth} overflow-auto rounded-lg bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
