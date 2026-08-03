"use client";

import { useRef, useState } from "react";
import FormSurface from "./FormSurface";
import type { FormSurfaceLooseItem } from "./FormSurface.types";
import { AntdCreatePanel } from "./internal/create/antd-create";
import {
  executeCreateSubmissionOnce,
  isCreateSubmissionDisabled,
  resolveCreateSubmissionMessage,
} from "./internal/create/antd-create-submit";
import { useFeedback } from "./services/FeedbackProvider";
import type { CreateSurfaceRuntimeProps, CreateSurfaceSubmissionResult } from "./CreateSurface.types";

export type * from "./CreateSurface.types";

export default function CreateSurface<T = FormSurfaceLooseItem>(
  props: CreateSurfaceRuntimeProps<T>,
) {
  const feedback = useFeedback();
  const submissionLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const flow = props.content.kind === "form" ? props.content.flow : undefined;
  const formSpec = props.content.kind === "form" ? props.content.form : null;
  const firstStage = flow?.kind === "two-stage" && flow.stage === "first";
  const activeItems = formSpec ? (firstStage ? flow.first.items : formSpec.items) : [];
  const content = formSpec ? (
    <FormSurface<T>
      kind="fields"
      content={{
        items: activeItems,
        layout: {
          ...formSpec.layout,
          flow: props.presentation === "inline" ? "inline" : "grid",
        },
      }}
    />
  ) : (
    <div className="space-y-4">
      {props.content.kind === "sections" ? props.content.sections.map((section) => (
        <section key={section.key} className="space-y-3">
          {section.title ? <h3 className="text-base font-semibold text-slate-900">{section.title}</h3> : null}
          <FormSurface<T>
            kind="fields"
            content={{ items: section.items, layout: { ...section.layout, flow: "grid" } }}
          />
        </section>
      )) : null}
    </div>
  );
  // Both outer surface disablement and submission-specific validation must hold.
  const submitDisabled = isCreateSubmissionDisabled({
    canCreate: props.canCreate,
    submissionDisabled: props.submission.disabled,
    surfaceDisabled: props.disabled,
  });
  const cancel = () => {
    if (submissionLock.current || submitting) return;
    props.onOpenChange(false);
    props.onCancel?.();
  };
  const handleSuccess = (result: void | CreateSurfaceSubmissionResult) => {
    const message = resolveCreateSubmissionMessage({
      action: props.submission.action,
      feedback: props.feedback,
      result,
      title: props.title,
    });
    feedback.success(message);
    props.onOpenChange(false);
  };
  const handleError = (error: unknown) => {
    const message = props.feedback?.error
      ?? (error instanceof Error ? error.message : `${props.title}创建失败`);
    feedback.error(message);
  };
  const create = () => executeCreateSubmissionOnce({
    lock: submissionLock,
    disabled: submitDisabled,
    execute: props.submission.execute,
    onPendingChange: setSubmitting,
    onSuccess: handleSuccess,
    onError: handleError,
  });

  if (props.presentation === "inline" && !props.open) return null;

  return (
    <AntdCreatePanel
      action={props.submission.action}
      anchor={props.presentation === "block" ? props.anchor : undefined}
      canCreate={props.canCreate}
      disabled={props.disabled}
      open={props.open}
      presentation={props.presentation}
      submitDisabled={submitDisabled}
      submitting={submitting}
      submitVisible={!firstStage}
      title={props.title}
      trigger={props.trigger}
      onCancel={cancel}
      onOpen={() => {
        if (!props.disabled && props.canCreate !== false && !submissionLock.current) props.onOpenChange(true);
      }}
      onSubmit={() => void create()}
    >
      {content}
    </AntdCreatePanel>
  );
}
