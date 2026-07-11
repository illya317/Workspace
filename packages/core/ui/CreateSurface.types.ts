import type {
  FormSurfaceItemSpec,
  FormSurfaceLayoutSpec,
  FormSurfaceLooseItem,
} from "./FormSurface.types";

export type CreateSurfaceTrigger = "toolbar" | "surface";
export type CreateSurfacePresentation = "inline" | "block" | "modal";

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

export type CreateSurfaceInlineProps<T = FormSurfaceLooseItem> = CreateSurfaceBaseProps<T> & {
  trigger: "toolbar";
  presentation: "inline";
  anchor?: never;
  content: Extract<CreateSurfaceContentSpec<T>, { kind: "form" }>;
};

export type CreateSurfaceBlockProps<T = FormSurfaceLooseItem> =
  | CreateSurfaceBaseProps<T> & {
      trigger: "toolbar";
      presentation: "block";
      anchor?: string;
    }
  | CreateSurfaceBaseProps<T> & {
      trigger: "surface";
      presentation: "block";
      anchor?: string;
    };

export type CreateSurfaceModalProps<T = FormSurfaceLooseItem> =
  | CreateSurfaceBaseProps<T> & {
      trigger: "toolbar";
      presentation: "modal";
      anchor?: never;
    }
  | CreateSurfaceBaseProps<T> & {
      trigger: "surface";
      presentation: "modal";
      anchor?: never;
    };

export type CreateSurfaceProps<T = FormSurfaceLooseItem> =
  | CreateSurfaceInlineProps<T>
  | CreateSurfaceBlockProps<T>
  | CreateSurfaceModalProps<T>;

export type CreateSurfaceToolbarProps<T = FormSurfaceLooseItem> = Extract<
  CreateSurfaceProps<T>,
  { trigger: "toolbar" }
>;

export type CreateSurfaceSurfaceProps<T = FormSurfaceLooseItem> = Extract<
  CreateSurfaceProps<T>,
  { trigger: "surface" }
>;
