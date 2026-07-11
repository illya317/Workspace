"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { SectionCard } from "../common/BaseCards";
import { CreateConfirmActions, CreateStartButton } from "../action/CreateActionControls";
import { useCreateSurfaceAnchorTarget } from "./CreateSurfaceAnchorContext";

export default function CreatePresentationPanel({
  anchor,
  trigger,
  title,
  content,
  open,
  presentation,
  canCreate = true,
  disabled,
  submitting,
  submitDisabled,
  submitAction,
  submitVisible,
  onOpen,
  onSubmit,
  onCancel,
}: {
  anchor?: string;
  trigger: "toolbar" | "surface";
  title: string;
  content: ReactNode;
  open: boolean;
  presentation: "block" | "modal";
  canCreate?: boolean;
  disabled?: boolean;
  submitting?: boolean;
  submitDisabled?: boolean;
  submitAction?: "save" | "submit";
  submitVisible?: boolean;
  onOpen: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const target = useCreateSurfaceAnchorTarget(anchor);
  const confirm = canCreate && open ? (
    <CreateConfirmActions
      onCancel={onCancel}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled ?? disabled}
      submitting={submitting}
      submitAction={submitAction}
      submitVisible={submitVisible}
      size="sm"
    />
  ) : null;
  const start = canCreate && trigger === "surface" ? (
    <CreateStartButton label={title} disabled={disabled || submitting} onClick={onOpen} size="sm" />
  ) : null;
  if (!open) return start;
  if (presentation === "modal") {
    return (
      <>
        {trigger === "surface" ? <CreateStartButton label={title} active disabled={disabled || submitting} onClick={onOpen} size="sm" /> : null}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto">
            <SectionCard title={<span className="inline-flex items-center gap-2"><span>{title}</span>{confirm}</span>}>
              {content}
            </SectionCard>
          </div>
        </div>
      </>
    );
  }
  const panel = trigger === "toolbar" ? (
    <SectionCard title={<span className="inline-flex items-center gap-2"><span>{title}</span>{confirm}</span>}>
      {content}
    </SectionCard>
  ) : <div className="rounded-lg border border-slate-200 bg-white p-3">{content}</div>;
  if (!target) return trigger === "surface" ? <>{confirm}{panel}</> : panel;
  return <>{confirm}{createPortal(panel, target)}</>;
}
