import type {
  FormSurfaceItemSpec,
  FormSurfaceLayoutSpec,
  FormSurfaceLooseItem,
} from "./FormSurface.types";

export type CreateSurfaceTrigger = "surface";
export type CreateSurfacePresentation = "inline" | "block";

export type CreateSurfaceFormLayoutSpec = Pick<
  FormSurfaceLayoutSpec,
  "columns" | "density"
>;

export interface CreateSurfaceFormSpec<T = FormSurfaceLooseItem> {
  items: FormSurfaceItemSpec<T>[];
  layout?: CreateSurfaceFormLayoutSpec;
}

export interface CreateSurfaceSectionSpec<T = FormSurfaceLooseItem> extends CreateSurfaceFormSpec<T> {
  key: string;
  title?: string;
}

export interface CreateSurfaceTwoStageSpec<T = FormSurfaceLooseItem> {
  kind: "two-stage";
  stage: "first" | "second";
  first: Pick<CreateSurfaceFormSpec<T>, "items">;
}

export interface CreateSurfaceFeedbackSpec {
  saved?: string;
  submitted?: string;
  error?: string;
}

export type CreateSurfaceSubmissionAction = "save" | "submit";
export type CreateSurfaceSubmissionOutcome = "saved" | "submitted";

export interface CreateSurfaceSubmissionResult {
  outcome: CreateSurfaceSubmissionOutcome;
  message?: string;
}

export interface CreateSurfaceSubmissionSpec {
  action: CreateSurfaceSubmissionAction;
  disabled?: boolean;
  execute: () => void | CreateSurfaceSubmissionResult | Promise<void | CreateSurfaceSubmissionResult>;
}

interface CreateSurfaceCommonProps {
  id: string;
  title: string;
  open: boolean;
  canCreate?: boolean;
  disabled?: boolean;
  submission: CreateSurfaceSubmissionSpec;
  feedback?: CreateSurfaceFeedbackSpec;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
}

export type CreateSurfaceContentSpec<T = FormSurfaceLooseItem> =
  | { kind: "form"; form: CreateSurfaceFormSpec<T>; flow?: CreateSurfaceTwoStageSpec<T> }
  | { kind: "sections"; sections: CreateSurfaceSectionSpec<T>[] };

type CreateSurfaceBaseProps<T = FormSurfaceLooseItem> = CreateSurfaceCommonProps & {
  content: CreateSurfaceContentSpec<T>;
};

type CreateSurfaceInlineSpec<T = FormSurfaceLooseItem> = CreateSurfaceBaseProps<T> & {
  presentation: "inline";
  anchor?: never;
  content: Extract<CreateSurfaceContentSpec<T>, { kind: "form" }>;
};

type CreateSurfaceBlockSpec<T = FormSurfaceLooseItem> = CreateSurfaceBaseProps<T> & {
  presentation: "block";
  anchor?: string;
};

export type PageSurfaceCreateSpec<T = FormSurfaceLooseItem> =
  | CreateSurfaceInlineSpec<T>
  | (Omit<CreateSurfaceBlockSpec<T>, "anchor"> & { anchor?: never });

export type CreateSurfaceBlockProps<T = FormSurfaceLooseItem> = CreateSurfaceBlockSpec<T> & {
  trigger: "surface";
};

export type CreateSurfaceProps<T = FormSurfaceLooseItem> = CreateSurfaceBlockProps<T>;

export type PageSurfaceCreateRuntimeProps<T = FormSurfaceLooseItem> = PageSurfaceCreateSpec<T> & {
  trigger: "toolbar";
};

export type CreateSurfaceRuntimeProps<T = FormSurfaceLooseItem> =
  | CreateSurfaceProps<T>
  | PageSurfaceCreateRuntimeProps<T>;

export type CreateSurfaceSurfaceProps<T = FormSurfaceLooseItem> = CreateSurfaceProps<T>;
