"use client";

import type { ReactNode } from "react";
import DetailModal from "./DetailModal";
import { joinClassNames } from "./card-utils";
import { getToolbarActionClassName } from "./toolbar-styles";

export interface ModalCreatePanelProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  maxWidth?: string;
  bodyClassName?: string;
}

export default function ModalCreatePanel({
  open,
  title,
  children,
  onSubmit,
  onCancel,
  submitDisabled,
  submitting,
  submitLabel = "创建",
  cancelLabel = "取消",
  maxWidth = "max-w-2xl",
  bodyClassName = "",
}: ModalCreatePanelProps) {
  return (
    <DetailModal open={open} title={title} onClose={onCancel} maxWidth={maxWidth}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled && !submitting) onSubmit();
        }}
        className="space-y-5"
      >
        <div className={joinClassNames("grid grid-cols-1 gap-4 md:grid-cols-2", bodyClassName)}>
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onCancel} className={getToolbarActionClassName("secondary")}>
            {cancelLabel}
          </button>
          <button type="submit" disabled={submitDisabled || submitting} className={getToolbarActionClassName("primary")}>
            {submitting ? "保存中..." : submitLabel}
          </button>
        </div>
      </form>
    </DetailModal>
  );
}
