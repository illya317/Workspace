"use client";

import type { FormEvent } from "react";
import { renderContent } from "./FormSurface.renderers";
import type { FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";

export type {
  FormSurfaceCommandSpec,
  FormSurfaceFieldSpec,
  FormSurfaceGroupTitleSpec,
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
  const content = renderContent(props);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit?.();
  };
  const body = props.onSubmit ? <form onSubmit={handleSubmit}>{content}</form> : content;
  return body;
}
