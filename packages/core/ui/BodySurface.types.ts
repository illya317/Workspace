import type { ReactNode, Ref } from "react";
import type { DataSurfaceLooseRow, DataSurfaceProps } from "./DataSurface.types";
import type { CreateSurfaceSurfaceProps } from "./CreateSurface.types";
import type { DocumentSurfaceProps } from "./DocumentSurface";
import type { FormSurfaceLooseItem, FormSurfaceProps } from "./FormSurface.types";
import type { SurfacePaginationSpec } from "./SurfaceContractTypes";
import type { SelectorSurfaceProps } from "./SelectorSurface.types";
import type { VisualizationSurfaceProps } from "./VisualizationSurface";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";
import type { ModuleCardColor } from "./internal/common/Card";

export type BodySurfaceKind = "create" | "create-anchor" | "data" | "document" | "form" | "selector" | "section" | "visualization";

export type BodySurfaceActionSize = "sm" | "md" | "lg" | "xl";
export type BodySurfaceSectionLayout = "stack" | "grid" | "split";
export type BodySurfaceSectionGridColumns = 2 | 3;
export type BodySurfaceSectionVisibility = "always" | "mobile" | "desktop";

export interface BodySurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: BodySurfaceActionSize;
  presentation?: "auto" | "text" | "icon";
  truncate?: boolean;
  scrollOnCreate?: boolean;
  revealTargetKey?: string;
}

export interface BodySurfaceEmptySpec {
  presentation?: "card" | "plain";
  content: ReactNode;
  compact?: boolean;
}

export interface BodySurfaceMessageSpec {
  content: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
  presentation?: "card" | "plain";
  link?: { label: string; href: string };
}

export interface BodySurfaceStatusSpec {
  kind: "empty" | "loading" | "error";
  content: ReactNode;
  compact?: boolean;
}

export interface BodySurfaceListItemSpec {
  key: string | number;
  title: ReactNode;
  label?: never;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  badges?: BodySurfaceBadgeSpec[];
  actions?: BodySurfaceCommandSpec[];
  sections?: BodySurfaceSectionSpec[];
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
  unread?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export interface BodySurfaceCardItemSpec extends Omit<BodySurfaceListItemSpec, "meta"> {
  meta?: never;
}

interface BodySurfaceListBaseSpec {
  empty?: BodySurfaceEmptySpec;
  footerAction?: BodySurfaceCommandSpec;
  density?: "normal" | "compact";
}

export type BodySurfaceListSpec = BodySurfaceListBaseSpec & (
  | { presentation: "cards"; items: BodySurfaceCardItemSpec[] }
  | { presentation?: "list"; items: BodySurfaceListItemSpec[] }
);

export interface BodySurfaceModuleGridItemSpec {
  key: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

export interface BodySurfaceModuleGridSpec {
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  columns?: 3 | 4 | 5;
  items: BodySurfaceModuleGridItemSpec[];
}

export type BodySurfaceModalPurpose =
  | "audit-history"
  | "read-only-inspection"
  | "workflow-action";

export interface BodySurfaceModalSpec {
  key: string;
  /** Required for approved exceptions. Omitted only by exact legacy-baseline entries awaiting migration. */
  purpose?: BodySurfaceModalPurpose;
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  sections: BodySurfaceSectionSpec[];
  actions?: BodySurfaceCommandSpec[];
  pagination?: SurfacePaginationSpec;
}

export interface BodySurfaceBadgeSpec {
  key: string;
  label: ReactNode;
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
}

export interface BodySurfaceSectionDirectCreateSpec {
  id: string;
  title: string;
  presentation: "row";
  canCreate?: boolean;
  disabled?: boolean;
  onCreate: () => void;
}

export type BodySurfaceSectionCreateSpec<T = FormSurfaceLooseItem> =
  | (Omit<Extract<CreateSurfaceSurfaceProps<T>, { presentation: "block" }>, "anchor"> & { anchor?: never })
  | BodySurfaceSectionDirectCreateSpec;

export interface BodySurfaceSectionHeaderSpec {
  title?: ReactNode;
  badges?: BodySurfaceBadgeSpec[];
  actions?: BodySurfaceCommandSpec[];
  create?: BodySurfaceSectionCreateSpec;
}

export interface BodySurfaceSectionDisclosureSpec {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

export interface BodySurfaceSectionCommonProps {
  kind: "section";
  title?: ReactNode;
  commands?: BodySurfaceCommandSpec[];
  message?: BodySurfaceMessageSpec;
  status?: BodySurfaceStatusSpec;
  empty?: BodySurfaceEmptySpec;
  list?: BodySurfaceListSpec;
  moduleGrid?: BodySurfaceModuleGridSpec;
  modals?: BodySurfaceModalSpec[];
}

export type BodySurfaceComposedSectionProps = BodySurfaceSectionCommonProps & {
  layout?: "stack" | "grid";
  gridColumns?: BodySurfaceSectionGridColumns;
  mobilePresentation?: "stack" | "drilldown";
  sections?: BodySurfaceSectionSpec[];
};

export type BodySurfaceSplitMasterPresentation = "default" | "compact";

export interface BodySurfaceSplitMasterFooterSpec {
  pagination?: SurfacePaginationSpec;
}

export type BodySurfaceSplitSectionProps = BodySurfaceSectionCommonProps & {
  layout: "split";
  master: {
    label: string;
    body: BodySurfaceProps;
    mobileBody?: BodySurfaceProps;
    presentation?: BodySurfaceSplitMasterPresentation;
    footer?: BodySurfaceSplitMasterFooterSpec;
  };
  detail: BodySurfaceProps;
  desktop?: {
    presentation?: "ratio" | "fixed-sidebar";
    ratio?: readonly [number, number];
  };
  mobile?: {
    detailActive?: boolean;
    onNavigateToList?: () => void;
  };
};

export type BodySurfaceSectionProps = BodySurfaceComposedSectionProps | BodySurfaceSplitSectionProps;
export interface BodySurfaceSectionSpec {
  key: string;
  label?: ReactNode;
  visibility?: BodySurfaceSectionVisibility;
  header?: BodySurfaceSectionHeaderSpec;
  disclosure?: BodySurfaceSectionDisclosureSpec;
  itemRef?: Ref<HTMLDivElement>;
  body: BodySurfaceSectionBodyProps;
}

export type BodySurfaceDataProps<T = DataSurfaceLooseRow> = { kind: "data"; data: DataSurfaceProps<T> };
export type BodySurfaceCreateProps<T = FormSurfaceLooseItem> = { kind: "create"; create: CreateSurfaceSurfaceProps<T> };
export type BodySurfaceCreateAnchorProps = { kind: "create-anchor"; anchor: string };
export type BodySurfaceDocumentProps = { kind: "document"; document: DocumentSurfaceProps };
export type BodySurfaceFormProps<T = FormSurfaceLooseItem> = { kind: "form"; form: FormSurfaceProps<T> };
export type BodySurfaceSelectorProps = { kind: "selector"; selector: SelectorSurfaceProps };
export type BodySurfaceVisualizationProps = { kind: "visualization"; visualization: VisualizationSurfaceProps };

export type BodySurfaceSectionBodyProps<TData = DataSurfaceLooseRow, TForm = FormSurfaceLooseItem> =
  | BodySurfaceCreateAnchorProps
  | BodySurfaceCreateProps<TForm>
  | BodySurfaceDataProps<TData>
  | BodySurfaceDocumentProps
  | BodySurfaceFormProps<TForm>
  | BodySurfaceSelectorProps
  | BodySurfaceSectionProps
  | BodySurfaceVisualizationProps;

export type BodySurfaceProps<TData = DataSurfaceLooseRow, TForm = FormSurfaceLooseItem> =
  | BodySurfaceCreateProps<TForm>
  | BodySurfaceCreateAnchorProps
  | BodySurfaceDataProps<TData>
  | BodySurfaceDocumentProps
  | BodySurfaceFormProps<TForm>
  | BodySurfaceSelectorProps
  | BodySurfaceSectionProps
  | BodySurfaceVisualizationProps;
