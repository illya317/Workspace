"use client";

import type { CSSProperties } from "react";
import { AntdInputSurface } from "./internal/input/antd-input";
import { inputMaskPlaceholder, type InputSurfaceProps } from "./internal/input/InputSurfaceTypes";

export { createInputOption } from "./internal/input/InputSurfaceTypes";

export type {
  InputBooleanPresentation,
  InputCollectionItemControl,
  InputSurfaceDimension,
  InputSurfaceKind,
  InputSurfaceProps,
  InputDependencies,
  InputDependencyDimension,
  InputFieldSpec,
  InputFormat,
  InputMask,
  InputOption,
  InputOptionDimension,
  InputOptionGroup,
  InputOptions,
  InputChoiceOptions,
  InputPresentationDimension,
  InputState,
  InputStateDimension,
  InputTemporalPrecision,
  InputUsage,
  InputUsageDimension,
  InputValidation,
  InputValidationDimension,
  InputValueDimension,
  InputValueType,
} from "./internal/input/InputSurfaceTypes";

export type InputSurfaceRendererProps = InputSurfaceProps & {
  className?: string;
  style?: CSSProperties;
  onDismiss?: () => void;
};

/** InputSurface has one implementation boundary: every declared kind enters the Ant dispatcher. */
export default function InputSurface(props: InputSurfaceProps) {
  return <InputSurfaceRenderer {...props} />;
}

export function InputSurfaceRenderer(props: InputSurfaceRendererProps) {
  const placeholder = props.placeholder ?? inputMaskPlaceholder(props.spec.mask);
  return <AntdInputSurface {...props} placeholder={placeholder} />;
}
