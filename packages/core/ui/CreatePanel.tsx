"use client";

import type { ReactNode } from "react";
import BlockCreatePanel from "./BlockCreatePanel";
import InlineCreatePanel from "./InlineCreatePanel";
import ModalCreatePanel from "./ModalCreatePanel";

export type CreatePanelVariant = "inline" | "block" | "modal";

interface CreatePanelBaseProps {
  variant: CreatePanelVariant;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  className?: string;
}

export interface CreatePanelInlineProps extends CreatePanelBaseProps {
  variant: "inline";
  hideTitle?: boolean;
}

export interface CreatePanelBlockProps extends CreatePanelBaseProps {
  variant: "block";
  creating: boolean;
  onStartCreate: () => void;
  canCreate?: boolean;
  createContent: ReactNode;
  disabled?: boolean;
  addLabel?: string;
  bodyClassName?: string;
  createClassName?: string;
}

export interface CreatePanelModalProps extends CreatePanelBaseProps {
  variant: "modal";
  open: boolean;
  maxWidth?: string;
  bodyClassName?: string;
}

export type CreatePanelProps =
  | CreatePanelInlineProps
  | CreatePanelBlockProps
  | CreatePanelModalProps;

export default function CreatePanel(props: CreatePanelProps) {
  const {
    variant,
    title,
    children,
    onSubmit,
    onCancel,
    submitDisabled,
    submitting,
    submitLabel,
    cancelLabel,
    className,
  } = props;

  if (variant === "inline") {
    const { hideTitle } = props as CreatePanelInlineProps;
    return (
      <InlineCreatePanel
        title={title}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        hideTitle={hideTitle}
        className={className}
      >
        {children}
      </InlineCreatePanel>
    );
  }

  if (variant === "block") {
    const {
      creating,
      onStartCreate,
      canCreate,
      createContent,
      disabled,
      addLabel,
      bodyClassName,
      createClassName,
    } = props as CreatePanelBlockProps;
    return (
      <BlockCreatePanel
        title={title}
        creating={creating}
        canCreate={canCreate}
        disabled={disabled}
        onStartCreate={onStartCreate}
        onSubmitCreate={onSubmit}
        onCancelCreate={onCancel}
        submitting={submitting}
        submitDisabled={submitDisabled}
        addLabel={addLabel}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        createContent={createContent}
        bodyClassName={bodyClassName}
        createClassName={createClassName}
        className={className}
      >
        {children}
      </BlockCreatePanel>
    );
  }

  const { open, maxWidth, bodyClassName } = props as CreatePanelModalProps;
  return (
    <ModalCreatePanel
      open={open}
      title={title}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitDisabled={submitDisabled}
      submitting={submitting}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      maxWidth={maxWidth}
      bodyClassName={bodyClassName}
    >
      {children}
    </ModalCreatePanel>
  );
}
