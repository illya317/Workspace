"use client";

import { useState } from "react";
import FormSurface from "./FormSurface";
import type { FormSurfaceLooseItem } from "./FormSurface.types";
import InlineCreatePanel from "./internal/create/InlineCreatePanel";
import CreatePresentationPanel from "./internal/create/CreatePresentationPanel";
import { useFeedback } from "./services/FeedbackProvider";
import type { CreateSurfaceRuntimeProps } from "./CreateSurface.types";

export type * from "./CreateSurface.types";

export default function CreateSurface<T = FormSurfaceLooseItem>(
  props: CreateSurfaceRuntimeProps<T>,
) {
  const feedback = useFeedback();
  const [submitting, setSubmitting] = useState(false);
  const flow = props.content.kind === "form" ? props.content.flow : undefined;
  const formSpec = props.content.kind === "form" ? props.content.form : null;
  const firstStage = flow?.kind === "two-stage" && flow.stage === "first";
  const activeItems = formSpec ? (firstStage ? flow.first.items : formSpec.items) : [];
  const form = formSpec ? (
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
  const submitDisabled = props.submission.disabled ?? props.disabled;
  const cancel = () => {
    props.onOpenChange(false);
    props.onCancel?.();
  };
  const create = async () => {
    if (submitting || submitDisabled) return;
    setSubmitting(true);
    try {
      const result = await props.submission.execute();
      const outcome = result?.outcome
        ?? (props.submission.action === "submit" ? "submitted" : "saved");
      const message = result?.message
        ?? (outcome === "submitted"
          ? props.feedback?.submitted ?? `${props.title}流程已提交`
          : props.feedback?.saved ?? `${props.title}已保存`);
      feedback.success(message);
      props.onOpenChange(false);
    } catch (error) {
      const message = props.feedback?.error
        ?? (error instanceof Error ? error.message : `${props.title}创建失败`);
      feedback.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (props.presentation === "inline") {
    if (!props.open) return null;
    return (
      <InlineCreatePanel
        title={props.title}
        onSubmit={() => void create()}
        onCancel={cancel}
        submitDisabled={submitDisabled}
        submitting={submitting}
        submitAction={props.submission.action}
        submitVisible={!firstStage}
      >
        {form}
      </InlineCreatePanel>
    );
  }

  return (
    <CreatePresentationPanel
      anchor={props.anchor}
      trigger={props.trigger}
      title={props.title}
      content={form}
      open={props.open}
      canCreate={props.canCreate}
      disabled={props.disabled}
      submitting={submitting}
      submitDisabled={submitDisabled}
      submitAction={props.submission.action}
      submitVisible={!firstStage}
      onOpen={() => props.onOpenChange(true)}
      onSubmit={() => void create()}
      onCancel={cancel}
    />
  );
}
