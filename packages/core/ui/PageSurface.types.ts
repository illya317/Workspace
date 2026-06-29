import type { ReactNode } from "react";
import type { BodySurfaceProps } from "./BodySurface";
import type { SelectorSurfaceProps } from "./SelectorSurface";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";
import type { ActionGlyphKind } from "./internal/action/ActionGlyphs";

export type PageSurfaceBodyKind = "complete" | "split";
export type PageSurfaceActionSize = "sm" | "md" | "lg";
export type PageSurfaceKind = "login" | "directory" | "standard";

export type PageSurfaceToolbarSpec = {
  items: SurfaceToolbarItems;
  onSubmit?: () => void;
  hidden?: boolean;
};

export interface PageSurfaceNavigationItemSpec {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: PageSurfaceNavigationItemSpec[];
}

export type PageSurfaceNavigationSpec = {
  kind: "tabs";
  items: PageSurfaceNavigationItemSpec[];
  active: string;
  activeChild?: string;
  onChange: (key: string) => void;
  onChildChange?: (key: string) => void;
};

export interface PageSurfaceFooterSpec {
  hidden?: boolean;
  pagination?: PageSurfacePaginationSpec;
}

export interface PageSurfacePaginationSpec {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
}

export interface PageSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: PageSurfaceActionSize;
  truncate?: boolean;
}

export interface PageSurfaceEmptySpec {
  presentation?: "card" | "plain";
  content: ReactNode;
  compact?: boolean;
}

export interface PageSurfaceModalSpec {
  key: string;
  open: boolean;
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  sections: PageSurfaceSectionSpec[];
}

export interface PageSurfaceBadgeSpec {
  key: string;
  label: ReactNode;
  tone?: "default" | "muted" | "info" | "success" | "warning" | "danger";
}

export interface PageSurfaceSectionHeaderSpec {
  title?: ReactNode;
  subtitle?: ReactNode;
  badges?: PageSurfaceBadgeSpec[];
  actions?: PageSurfaceCommandSpec[];
}

export interface PageSurfaceSectionBaseSpec {
  key: string;
  label?: ReactNode;
  header?: PageSurfaceSectionHeaderSpec;
  framed?: boolean;
}

export type PageSurfaceBodySectionSpec = PageSurfaceSectionBaseSpec & {
  body: BodySurfaceProps;
};

export type PageSurfaceSectionSpec = PageSurfaceBodySectionSpec;

export type PageSurfaceSectioningSpec =
  | { kind: "none" }
  | { kind: "tabs"; active: string; onChange?: (key: string) => void };

export interface PageSurfaceCompleteBodySpec {
  kind: "complete";
  title?: ReactNode;
  description?: ReactNode;
  layout?: "single" | "split";
  sectioning?: PageSurfaceSectioningSpec;
  sections?: PageSurfaceSectionSpec[];
  modals?: PageSurfaceModalSpec[];
  empty?: PageSurfaceEmptySpec;
  commands?: PageSurfaceCommandSpec[];
}

export interface PageSurfaceSplitBodySpec {
  kind: "split";
  selector: SelectorSurfaceProps;
  drawerSelector?: SelectorSurfaceProps;
  right: PageSurfaceCompleteBodySpec;
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  showSideControls?: boolean;
  splitRatio?: readonly [number, number];
}

export type PageSurfaceBodySpec = PageSurfaceCompleteBodySpec | PageSurfaceSplitBodySpec;

interface PageSurfaceChromeProps {
  body?: PageSurfaceBodySpec;
  footer?: PageSurfaceFooterSpec;
  embedded?: boolean;
}

export type PageSurfaceLoginProps = {
  kind: "login";
  body?: PageSurfaceBodySpec;
  embedded?: never;
  footer?: never;
  navigation?: never;
  toolbar?: never;
};

export type PageSurfaceDirectoryProps = {
  kind: "directory";
  body?: PageSurfaceBodySpec;
  footer?: never;
  embedded?: never;
  navigation?: never;
  toolbar?: never;
};

export type PageSurfaceStandardProps = PageSurfaceChromeProps & {
  kind?: "standard";
  navigation?: PageSurfaceNavigationSpec;
  toolbar?: PageSurfaceToolbarSpec;
};

export type PageSurfaceProps =
  | PageSurfaceLoginProps
  | PageSurfaceDirectoryProps
  | PageSurfaceStandardProps;
