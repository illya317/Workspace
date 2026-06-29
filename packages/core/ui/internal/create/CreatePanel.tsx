"use client";

import type { ReactNode } from "react";
import BlockCreatePanel from "./BlockCreatePanel";
import InlineCreatePanel from "./InlineCreatePanel";

export type CreatePanelVariant = "inline" | "block";

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
  scrollOnCreate?: boolean;
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
  presentation?: "block" | "modal";
  modalMaxWidth?: string;
  bodyClassName?: string;
  createClassName?: string;
}

export type CreatePanelProps =
  | CreatePanelInlineProps
  | CreatePanelBlockProps;

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
    scrollOnCreate,
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
        scrollOnCreate={scrollOnCreate}
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
      presentation,
      modalMaxWidth,
      bodyClassName,
      createClassName,
    } = props as CreatePanelBlockProps;
    return (
      <BlockCreatePanel
        title={title}
        creating={creating}
        canCreate={canCreate}
        disabled={disabled}
        presentation={presentation}
        modalMaxWidth={modalMaxWidth}
        onStartCreate={onStartCreate}
        onSubmitCreate={onSubmit}
        onCancelCreate={onCancel}
        submitting={submitting}
        submitDisabled={submitDisabled}
        addLabel={addLabel}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        scrollOnCreate={scrollOnCreate}
        createContent={createContent}
        bodyClassName={bodyClassName}
        createClassName={createClassName}
        className={className}
      >
        {children}
      </BlockCreatePanel>
    );
  }
}
