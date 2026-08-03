"use client";

import { Button, Card } from "antd";
import { createPortal } from "react-dom";
import type { FormEvent, ReactNode } from "react";
import type { CreateSurfacePresentation, CreateSurfaceSubmissionAction } from "../../CreateSurface.types";
import { useCreateSurfaceAnchorTarget } from "./CreateSurfaceAnchorContext";
import { useCreatePanelAutoScroll } from "./useCreatePanelAutoScroll";

interface AntdCreateActionsProps {
  action: CreateSurfaceSubmissionAction;
  submitting: boolean;
  submitDisabled: boolean;
  submitVisible: boolean;
  onCancel: () => void;
}

function AntdCreateActions({
  action,
  submitting,
  submitDisabled,
  submitVisible,
  onCancel,
}: AntdCreateActionsProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2" data-create-actions="true">
      {submitVisible ? (
        <Button
          autoInsertSpace={false}
          disabled={submitDisabled || submitting}
          htmlType="submit"
          loading={submitting}
          type="primary"
        >
          {action === "submit" ? "提交" : "保存"}
        </Button>
      ) : null}
      <Button autoInsertSpace={false} disabled={submitting} htmlType="button" onClick={onCancel}>
        取消
      </Button>
    </div>
  );
}

interface AntdCreateFormProps {
  action: CreateSurfaceSubmissionAction;
  children: ReactNode;
  inline: boolean;
  submitting: boolean;
  submitDisabled: boolean;
  submitVisible: boolean;
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
}

function AntdCreateForm({
  action,
  children,
  inline,
  submitting,
  submitDisabled,
  submitVisible,
  title,
  onCancel,
  onSubmit,
}: AntdCreateFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitVisible || submitDisabled || submitting) return;
    onSubmit();
  };
  return (
    <form
      aria-label={`${title}表单`}
      className={inline ? "flex min-w-0 flex-1 flex-wrap items-end gap-3" : "space-y-4"}
      data-create-native-form="true"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className={inline ? "min-w-0 flex-1" : "space-y-4"}>{children}</div>
      <AntdCreateActions
        action={action}
        onCancel={onCancel}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitVisible={submitVisible}
      />
    </form>
  );
}

export interface AntdCreatePanelProps {
  action: CreateSurfaceSubmissionAction;
  anchor?: string;
  canCreate?: boolean;
  children: ReactNode;
  disabled?: boolean;
  open: boolean;
  presentation: CreateSurfacePresentation;
  submitDisabled: boolean;
  submitVisible: boolean;
  submitting: boolean;
  title: string;
  trigger: "toolbar" | "surface";
  onCancel: () => void;
  onOpen: () => void;
  onSubmit: () => void;
}

export function AntdCreatePanel({
  action,
  anchor,
  canCreate = true,
  children,
  disabled,
  open,
  presentation,
  submitDisabled,
  submitVisible,
  submitting,
  title,
  trigger,
  onCancel,
  onOpen,
  onSubmit,
}: AntdCreatePanelProps) {
  const target = useCreateSurfaceAnchorTarget(anchor);
  const scrollRef = useCreatePanelAutoScroll<HTMLElement>(
    open,
    open ? target ?? `${presentation}:${anchor ?? "local"}` : null,
  );
  const start = canCreate && trigger === "surface" ? (
    <Button autoInsertSpace={false} disabled={disabled || submitting || open} onClick={onOpen} type="primary">
      {title}
    </Button>
  ) : null;

  if (!open) return start;

  const form = (
    <AntdCreateForm
      action={action}
      inline={presentation === "inline"}
      onCancel={onCancel}
      onSubmit={onSubmit}
      submitDisabled={submitDisabled}
      submitting={submitting}
      submitVisible={submitVisible}
      title={title}
    >
      {children}
    </AntdCreateForm>
  );

  if (presentation === "inline") {
    return (
      <section
        className="relative z-10 border-y border-slate-100 bg-white px-4 py-3"
        data-create-presentation="inline"
        ref={scrollRef}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h3 className="shrink-0 text-sm font-semibold text-slate-900">{title}</h3>
          {form}
        </div>
      </section>
    );
  }

  const panel = (
    <section data-create-presentation="block" ref={scrollRef}>
      <Card className="border-slate-200 shadow-sm" title={title}>{form}</Card>
    </section>
  );
  return target ? createPortal(panel, target) : panel;
}
