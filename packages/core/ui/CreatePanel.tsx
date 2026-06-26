"use client";

import type { ReactNode } from "react";
import BlockCreatePanel from "./BlockCreatePanel";
import DetailCreatePanel from "./DetailCreatePanel";
import InlineCreatePanel from "./InlineCreatePanel";
import ModalCreatePanel from "./ModalCreatePanel";

export type CreatePanelVariant = "inline" | "block" | "modal" | "detail";

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
  bodyClassName?: string;
  createClassName?: string;
}

export interface CreatePanelModalProps extends CreatePanelBaseProps {
  variant: "modal";
  open: boolean;
  maxWidth?: string;
  bodyClassName?: string;
}

export interface CreatePanelDetailProps {
  variant: "detail";
  title: string;
  createTitle?: string;
  children: ReactNode;
  createContent: ReactNode;
  creating: boolean;
  onStartCreate?: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  canCreate?: boolean;
  addLabel?: string;
  dirty?: boolean;
  dirtyHint?: string;
  onSave?: () => void;
  canSave?: boolean;
  saveLabel?: string;
  onDelete?: () => void;
  canDelete?: boolean;
  deleteLabel?: string;
  viewActions?: ReactNode;
  submitDisabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  scrollOnCreate?: boolean;
  className?: string;
  bodyClassName?: string;
}

export type CreatePanelProps =
  | CreatePanelInlineProps
  | CreatePanelBlockProps
  | CreatePanelModalProps
  | CreatePanelDetailProps;

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

  if (variant === "modal") {
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

  const {
    createTitle,
    createContent,
    creating,
    onStartCreate,
    canCreate,
    addLabel,
    dirty,
    dirtyHint,
    onSave,
    canSave,
    saveLabel,
    onDelete,
    canDelete,
    deleteLabel,
    viewActions,
    bodyClassName,
  } = props as CreatePanelDetailProps;
  return (
    <DetailCreatePanel
      title={title}
      createTitle={createTitle}
      creating={creating}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
      onSubmitCreate={onSubmit}
      onCancelCreate={onCancel}
      dirty={dirty}
      dirtyHint={dirtyHint}
      onSave={onSave}
      canSave={canSave}
      saveLabel={saveLabel}
      onDelete={onDelete}
      canDelete={canDelete}
      deleteLabel={deleteLabel}
      viewActions={viewActions}
      submitDisabled={submitDisabled}
      submitting={submitting}
      addLabel={addLabel}
      submitLabel={submitLabel}
      cancelLabel={cancelLabel}
      scrollOnCreate={scrollOnCreate}
      createContent={createContent}
      bodyClassName={bodyClassName}
      className={className}
    >
      {children}
    </DetailCreatePanel>
  );
}
