import type { Ref, ReactNode } from "react";
import type { FieldGridCellProps, FieldGridMode } from "./internal/input/FieldGrid";
import type { InputControlProps } from "./InputControl";
import type { ReadOnlyFieldProps } from "./internal/input/ReadOnlyField";
import type { TagListInputProps } from "./internal/input/TagListInput";
import type { CommandButtonProps } from "./internal/common/CommandButton";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";

export type FormSurfaceKind = "fields" | "filters" | "inline" | "detail" | "login";
export type FormSurfaceLooseItem = ReturnType<typeof JSON.parse>;

export interface FormSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind;
  presentation?: "auto" | "text" | "icon";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: CommandButtonProps["size"];
  className?: string;
  truncate?: boolean;
}

export interface FormSurfaceFieldSpec extends Omit<InputControlProps, "spec" | "value" | "onChange"> {
  kind?: "field";
  key: string;
  label: ReactNode;
  spec: InputControlProps["spec"];
  value?: InputControlProps["value"];
  onChange?: InputControlProps["onChange"];
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  fieldClassName?: string;
}

export interface FormSurfaceReadOnlyFieldSpec extends Omit<ReadOnlyFieldProps, "children"> {
  kind: "readonly";
  key: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  fieldClassName?: string;
}

export interface FormSurfaceTagListAppendSpec {
  field?: FormSurfaceFieldSpec;
  action?: FormSurfaceCommandSpec;
  textInput?: {
    key: string;
    addLabel?: string;
    placeholder?: string;
    splitPattern?: RegExp;
    onAppend: (values: string[]) => void;
    onRemoveLast?: () => void;
    className?: string;
    inputClassName?: string;
  };
  className?: string;
}

export interface FormSurfaceTagListFieldSpec<T = FormSurfaceLooseItem> extends Omit<TagListInputProps<T>, "children" | "append" | "renderItem"> {
  kind: "tagList";
  key: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  fieldClassName?: string;
  append?: FormSurfaceTagListAppendSpec;
}

export interface FormSurfaceNoteSpec {
  kind: "note";
  key: string;
  content: ReactNode;
  className?: string;
}

export interface FormSurfaceGroupTitleSpec {
  kind: "groupTitle";
  key: string;
  title: ReactNode;
  className?: string;
}

export interface FormSurfaceSectionSpec<T = FormSurfaceLooseItem> {
  kind: "section";
  key: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  fields: FormSurfaceItemSpec<T>[];
  columns?: 1 | 2 | 3;
  mode?: FieldGridMode;
  actions?: FormSurfaceCommandSpec[];
  className?: string;
  bodyClassName?: string;
}

export interface FormSurfaceRepeatableItemSpec<T = FormSurfaceLooseItem> {
  key: string;
  itemRef?: Ref<HTMLDivElement>;
  title?: ReactNode;
  subtitle?: ReactNode;
  fields: FormSurfaceItemSpec<T>[];
  actions?: FormSurfaceCommandSpec[];
  className?: string;
}

export interface FormSurfaceRepeatableSpec<T = FormSurfaceLooseItem> {
  kind: "repeatable";
  key: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  items: FormSurfaceRepeatableItemSpec<T>[];
  columns?: 1 | 2 | 3;
  mode?: FieldGridMode;
  addAction?: FormSurfaceCommandSpec;
  empty?: ReactNode;
  className?: string;
}

export type FormSurfaceItemSpec<T = FormSurfaceLooseItem> =
  | FormSurfaceFieldSpec
  | FormSurfaceReadOnlyFieldSpec
  | FormSurfaceTagListFieldSpec<T>
  | FormSurfaceNoteSpec
  | FormSurfaceGroupTitleSpec
  | FormSurfaceSectionSpec<T>
  | FormSurfaceRepeatableSpec<T>;

interface FormSurfaceBaseProps<T = FormSurfaceLooseItem> {
  kind: FormSurfaceKind;
  fields?: FormSurfaceItemSpec<T>[];
  field?: FormSurfaceFieldSpec;
  columns?: 1 | 2 | 3;
  mode?: FieldGridMode;
  actions?: FormSurfaceCommandSpec[];
  onSubmit?: () => void;
  className?: string;
  bodyClassName?: string;
}

export interface FormSurfaceInlineProps<T = FormSurfaceLooseItem> extends FormSurfaceBaseProps<T> {
  kind: "inline" | "filters";
}

export interface FormSurfaceFieldsProps<T = FormSurfaceLooseItem> extends FormSurfaceBaseProps<T> {
  kind: "fields" | "detail";
}

export interface FormSurfaceLoginProps<T = FormSurfaceLooseItem> extends FormSurfaceBaseProps<T> {
  kind: "login";
}

export type FormSurfaceFieldModeProps<T = FormSurfaceLooseItem> =
  | FormSurfaceInlineProps<T>
  | FormSurfaceFieldsProps<T>
  | FormSurfaceLoginProps<T>;

export type FormSurfaceProps<T = FormSurfaceLooseItem> =
  | FormSurfaceInlineProps<T>
  | FormSurfaceFieldsProps<T>
  | FormSurfaceLoginProps<T>;
