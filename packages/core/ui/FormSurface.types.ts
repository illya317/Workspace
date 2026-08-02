import type { Ref, ReactNode } from "react";
import type { FieldGridCellProps, FieldGridMode } from "./internal/input/FieldGrid";
import type { InputSurfaceProps } from "./InputSurface";
import type { ReadOnlyFieldProps } from "./internal/input/ReadOnlyField";
import type { TagListInputProps } from "./internal/input/TagListInput";
import type { CommandButtonProps } from "./internal/common/CommandButton";
import type { ActionGlyphActionKey, ActionGlyphKind } from "./internal/action/ActionGlyphs";
import type { ReferenceOption, SurfaceLifecycleScope } from "./SurfaceContractTypes";

export type FormSurfaceKind = "fields" | "filters" | "detail" | "login";
export type FormSurfaceLooseItem = ReturnType<typeof JSON.parse>;
export type FormSurfaceLayoutFlow = "grid" | "inline" | "single";
export type FormSurfaceFieldLayout = "inline" | "stack";
export type FormSurfaceSectionChrome = "card" | "divider" | "plain";

export interface FormSurfaceLayoutSpec {
  flow?: FormSurfaceLayoutFlow;
  columns?: 1 | 2 | 3 | 4 | 6;
  mode?: FieldGridMode;
  density?: InputSurfaceProps["density"];
  fieldLayout?: FormSurfaceFieldLayout;
}

export interface FormSurfaceFilterLayoutSpec extends FormSurfaceLayoutSpec {
  commandPlacement?: "below" | "inline";
}

export interface FormSurfaceSubmitSpec {
  onSubmit: () => void;
}

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
  truncate?: boolean;
}

export interface FormSurfaceActionSpec {
  key: string;
  action: ActionGlyphActionKey;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface FormSurfaceHeaderSpec {
  title?: ReactNode;
  description?: ReactNode;
}

type FormSurfaceInputProps = Omit<
  InputSurfaceProps,
  | "spec"
  | "value"
  | "onChange"
  | "className"
  | "style"
  | "unstyled"
  | "wrapperClassName"
  | "fontRole"
  | "visualVariant"
  | "choiceOptionClassName"
  | "choiceMarkerClassName"
  | "fileInputClassName"
  | "fileControlsClassName"
>;

export interface FormSurfaceFieldSpec extends FormSurfaceInputProps {
  kind?: "field";
  key: string;
  label: ReactNode;
  spec: InputSurfaceProps["spec"];
  value?: InputSurfaceProps["value"];
  onChange?: InputSurfaceProps["onChange"];
  actions?: FormSurfaceCommandSpec[];
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  rowSpan?: FieldGridCellProps["rowSpan"];
}

export interface FormSurfaceReadOnlyFieldSpec extends Omit<ReadOnlyFieldProps, "children"> {
  kind: "readonly";
  key: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  rowSpan?: FieldGridCellProps["rowSpan"];
}

export interface FormSurfaceTagListAppendSpec {
  field?: FormSurfaceFieldSpec;
  action?: FormSurfaceCommandSpec;
  referenceInput?: {
    key: string;
    addLabel?: string;
    placeholder?: string;
    presentation?: "inline" | "modal";
    modalTitle?: string;
    modalSize?: "sm" | "md" | "lg" | "xl";
    searchLabel?: ReactNode;
    fkKey: string;
    endpoint: string;
    lifecycleScope?: SurfaceLifecycleScope;
    queryParams?: Record<string, string | number | boolean | null | undefined>;
    visibleCount?: number;
    onAppend: (option: ReferenceOption) => void;
    onRemoveLast?: () => void;
    create?: {
      title?: ReactNode;
      description?: ReactNode;
      fields: FormSurfaceFieldSpec[];
      layout?: Pick<FormSurfaceLayoutSpec, "columns" | "mode" | "density" | "fieldLayout">;
      submit: FormSurfaceCommandSpec;
      actions?: FormSurfaceCommandSpec[];
    };
  };
  textInput?: {
    key: string;
    addLabel?: string;
    placeholder?: string;
    splitPattern?: RegExp;
    onAppend: (values: string[]) => void;
    onRemoveLast?: () => void;
  };
}

export interface FormSurfaceTagListFieldSpec<T = FormSurfaceLooseItem> extends Omit<TagListInputProps<T>, "children" | "append" | "emptyText" | "renderItem"> {
  kind: "tagList";
  key: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  span?: FieldGridCellProps["span"];
  rowSpan?: FieldGridCellProps["rowSpan"];
  append?: FormSurfaceTagListAppendSpec;
}

export interface FormSurfaceNoteSpec {
  kind: "note";
  key: string;
  content: ReactNode;
}

export interface FormSurfaceGroupTitleSpec {
  kind: "groupTitle";
  key: string;
  title: ReactNode;
}

export interface FormSurfaceSectionSpec<T = FormSurfaceLooseItem> {
  kind: "section";
  key: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  items: FormSurfaceItemSpec<T>[];
  layout?: FormSurfaceLayoutSpec;
  actions?: FormSurfaceCommandSpec[];
  chrome?: FormSurfaceSectionChrome;
  framed?: boolean;
}

export interface FormSurfaceRepeatableItemSpec<T = FormSurfaceLooseItem> {
  key: string;
  itemRef?: Ref<HTMLDivElement>;
  title?: ReactNode;
  subtitle?: ReactNode;
  items: FormSurfaceItemSpec<T>[];
  actions?: FormSurfaceCommandSpec[];
}

export interface FormSurfaceRepeatableSpec<T = FormSurfaceLooseItem> {
  kind: "repeatable";
  key: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  items: FormSurfaceRepeatableItemSpec<T>[];
  layout?: FormSurfaceLayoutSpec;
  addAction?: FormSurfaceCommandSpec;
  empty?: ReactNode;
}

export type FormSurfaceItemSpec<T = FormSurfaceLooseItem> =
  | FormSurfaceFieldSpec
  | FormSurfaceReadOnlyFieldSpec
  | FormSurfaceTagListFieldSpec<T>
  | FormSurfaceNoteSpec
  | FormSurfaceGroupTitleSpec
  | FormSurfaceSectionSpec<T>
  | FormSurfaceRepeatableSpec<T>;

export interface FormSurfaceContentSpec<T = FormSurfaceLooseItem> {
  items: FormSurfaceItemSpec<T>[];
  layout?: FormSurfaceLayoutSpec;
}

export interface FormSurfaceFilterContentSpec<T = FormSurfaceLooseItem> extends Omit<FormSurfaceContentSpec<T>, "layout"> {
  layout?: FormSurfaceFilterLayoutSpec;
}

interface FormSurfaceRootActionProps {
  header?: FormSurfaceHeaderSpec;
  actions?: FormSurfaceActionSpec[];
  submit?: FormSurfaceSubmitSpec;
}

export interface FormSurfaceFieldsProps<T = FormSurfaceLooseItem> extends FormSurfaceRootActionProps {
  kind: "fields";
  content: FormSurfaceContentSpec<T>;
}

export interface FormSurfaceFiltersProps<T = FormSurfaceLooseItem> extends FormSurfaceRootActionProps {
  kind: "filters";
  content: FormSurfaceFilterContentSpec<T>;
  commands?: FormSurfaceCommandSpec[];
}

export interface FormSurfaceDetailProps<T = FormSurfaceLooseItem> extends FormSurfaceRootActionProps {
  kind: "detail";
  content: FormSurfaceContentSpec<T>;
}

export interface FormSurfaceLoginProps<T = FormSurfaceLooseItem> extends FormSurfaceRootActionProps {
  kind: "login";
  content: FormSurfaceContentSpec<T>;
}

export type FormSurfaceProps<T = FormSurfaceLooseItem> =
  | FormSurfaceDetailProps<T>
  | FormSurfaceFiltersProps<T>
  | FormSurfaceFieldsProps<T>
  | FormSurfaceLoginProps<T>;
