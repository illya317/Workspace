import type { ComponentProps, ReactNode } from "react";
import type CalendarDateInput from "./CalendarDateInput";
import type { ChoiceGroupProps } from "./ChoiceGroup";
import type { FieldGridCellProps, FieldGridMode } from "./FieldGrid";
import type { FileFieldProps } from "./FileField";
import type { HiddenDataFieldProps } from "./HiddenDataField";
import type { InputControlProps } from "./InputControl";
import type { ReadOnlyFieldProps } from "./ReadOnlyField";
import type { SelectFieldProps } from "./SelectField";
import type { TagListInputProps } from "./TagListInput";
import type { TextareaFieldProps } from "./TextareaField";
import type { TextFieldProps } from "./TextField";
import type { CommandButtonProps } from "./CommandButton";
import type { ToolbarProps } from "./Toolbar";
import type { ActionGlyphKind } from "./ActionGlyphs";

export type FormSurfaceKind = "fields" | "filters" | "modal" | "inline" | "detail" | "login" | "control";
export type FormSurfaceLooseItem = ReturnType<typeof JSON.parse>;

export type FormSurfaceToolbarSpec = Omit<ToolbarProps, "items"> & {
  items: ToolbarProps["items"];
};

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

type CalendarDateInputProps = ComponentProps<typeof CalendarDateInput>;

export type FormSurfaceInputControlSpec = InputControlProps & { kind: "inputControl" };
export type FormSurfaceTextControlSpec = TextFieldProps & { kind: "text" };
export type FormSurfaceTextareaControlSpec = TextareaFieldProps & { kind: "textarea" };
export type FormSurfaceCalendarDateControlSpec = CalendarDateInputProps & { kind: "calendarDate" };
export type FormSurfaceChoiceControlSpec = ChoiceGroupProps & { kind: "choice" };
export type FormSurfaceSelectControlSpec = SelectFieldProps & { kind: "select" };
export type FormSurfaceFileControlSpec = FileFieldProps & { kind: "file" };
export type FormSurfaceHiddenControlSpec = HiddenDataFieldProps & { kind: "hidden" };

export type FormSurfaceControlSpec =
  | FormSurfaceInputControlSpec
  | FormSurfaceTextControlSpec
  | FormSurfaceTextareaControlSpec
  | FormSurfaceCalendarDateControlSpec
  | FormSurfaceChoiceControlSpec
  | FormSurfaceSelectControlSpec
  | FormSurfaceFileControlSpec
  | FormSurfaceHiddenControlSpec;

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
  toolbar?: FormSurfaceToolbarSpec;
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

export interface FormSurfaceModalProps<T = FormSurfaceLooseItem> extends FormSurfaceBaseProps<T> {
  kind: "modal";
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
}

export interface FormSurfaceControlProps {
  kind: "control";
  control: FormSurfaceControlSpec;
}

export type FormSurfaceFieldModeProps<T = FormSurfaceLooseItem> =
  | FormSurfaceInlineProps<T>
  | FormSurfaceFieldsProps<T>
  | FormSurfaceLoginProps<T>
  | FormSurfaceModalProps<T>;

export type FormSurfaceProps<T = FormSurfaceLooseItem> =
  | FormSurfaceInlineProps<T>
  | FormSurfaceFieldsProps<T>
  | FormSurfaceLoginProps<T>
  | FormSurfaceModalProps<T>
  | FormSurfaceControlProps;
