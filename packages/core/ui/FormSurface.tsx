"use client";

import type { FormEvent } from "react";
import { renderContent } from "./internal/form/FormSurface.renderers";
import type { FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";

export type {
  FormSurfaceCommandSpec,
  FormSurfaceActionSpec,
  FormSurfaceContentSpec,
  FormSurfaceDetailProps,
  FormSurfaceFieldSpec,
  FormSurfaceFilterContentSpec,
  FormSurfaceFilterLayoutSpec,
  FormSurfaceFieldsProps,
  FormSurfaceFiltersProps,
  FormSurfaceGroupTitleSpec,
  FormSurfaceHeaderSpec,
  FormSurfaceItemSpec,
  FormSurfaceKind,
  FormSurfaceLayoutFlow,
  FormSurfaceLayoutSpec,
  FormSurfaceLooseItem,
  FormSurfaceLoginProps,
  FormSurfaceNoteSpec,
  FormSurfaceProps,
  FormSurfaceReadOnlyFieldSpec,
  FormSurfaceRepeatableItemSpec,
  FormSurfaceRepeatableSpec,
  FormSurfaceSectionSpec,
  FormSurfaceSubmitSpec,
  FormSurfaceTagListAppendSpec,
  FormSurfaceTagListFieldSpec,
} from "./FormSurface.types";

export default function FormSurface<T = FormSurfaceLooseItem>(props: FormSurfaceProps<T>) {
  const content = renderContent(props);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.submit?.onSubmit();
  };
  const body = props.submit || props.actions?.length ? <form onSubmit={handleSubmit}>{content}</form> : content;
  return body;
}
