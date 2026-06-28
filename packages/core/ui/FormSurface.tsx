"use client";

import type { FormEvent } from "react";
import DetailModal from "./DetailModal";
import { renderControlSpec } from "./FormSurface.controls";
import { renderContent } from "./FormSurface.renderers";
import type { FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";

export type {
  FormSurfaceCommandSpec,
  FormSurfaceControlProps,
  FormSurfaceControlSpec,
  FormSurfaceFieldSpec,
  FormSurfaceGroupTitleSpec,
  FormSurfaceInputControlSpec,
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceLooseItem,
  FormSurfaceLoginProps,
  FormSurfaceNoteSpec,
  FormSurfaceProps,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceRepeatableItemSpec,
  FormSurfaceRepeatableSpec,
  FormSurfaceSectionSpec,
  FormSurfaceTagListAppendSpec,
  FormSurfaceTagListFieldSpec,
} from "./FormSurface.types";

export default function FormSurface<T = FormSurfaceLooseItem>(props: FormSurfaceProps<T>) {
  if (props.kind === "control") {
    return renderControlSpec(props.control);
  }

  const content = renderContent(props);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit?.();
  };
  const body = props.onSubmit ? <form onSubmit={handleSubmit}>{content}</form> : content;

  if (props.kind === "modal") {
    return (
      <DetailModal open={props.open} title={props.title} onClose={props.onClose} maxWidth={props.maxWidth}>
        {body}
      </DetailModal>
    );
  }

  return body;
}
