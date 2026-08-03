"use client";

import { useState, type FormEvent } from "react";
import { AntdFormSurface } from "./internal/form/antd-form";
import { executeFormSurfaceSubmit } from "./internal/form/form-surface-submit";
import {
  findMissingFormSurfaceRequiredFields,
  withFormSurfaceRequiredErrors,
} from "./internal/form/form-surface-required";
import { useSurfaceFrameDepth } from "./internal/common/SurfaceFrameContextParts";
import type { FormSurfaceActionSpec, FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";

export type {
  FormSurfaceCommandSpec,
  FormSurfaceActionSpec,
  FormSurfaceContentSpec,
  FormSurfaceDetailProps,
  FormSurfaceFieldSpec,
  FormSurfaceFilterContentSpec,
  FormSurfaceFilterLayoutSpec,
  FormSurfaceFieldsProps,
  FormSurfaceFieldLayout,
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
  const [requiredValidationAttempted, setRequiredValidationAttempted] = useState(false);
  const insideFrame = useSurfaceFrameDepth() > 0;
  const missingRequiredFields = findMissingFormSurfaceRequiredFields(props.content.items);
  const validateRequiredFields = () => {
    if (missingRequiredFields.length === 0) return true;
    setRequiredValidationAttempted(true);
    return false;
  };
  const actions = props.actions?.map((action): FormSurfaceActionSpec => {
    if (!action.onClick || (action.action !== "save" && action.action !== "submit")) return action;
    return {
      ...action,
      onClick: () => {
        if (validateRequiredFields()) action.onClick?.();
      },
    };
  });
  const renderedProps = {
    ...props,
    actions,
    content: {
      ...props.content,
      items: requiredValidationAttempted
        ? withFormSurfaceRequiredErrors(props.content.items)
        : props.content.items,
    },
  } as FormSurfaceProps<T>;
  const content = <AntdFormSurface surface={renderedProps} insideFrame={insideFrame} />;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateRequiredFields()) return;
    executeFormSurfaceSubmit(props.submit, actions);
  };
  return props.submit || props.actions?.length
    ? <form noValidate onSubmit={handleSubmit}>{content}</form>
    : content;
}
