import type { ReactNode } from "react";
import type { BlockSurfaceProps } from "./BlockSurface";
import type { DataSurfaceProps } from "./DataSurface.types";
import type { DocumentSurfaceProps } from "./DocumentSurface";
import type { FormSurfaceProps } from "./FormSurface.types";
import type { NavigationSurfaceProps } from "./NavigationSurface";
import type { VisualizationSurfaceProps } from "./VisualizationSurface";
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

export type PageSurfaceSectionSpec =
  | (PageSurfaceSectionBaseSpec & { kind: "data"; surface: DataSurfaceProps })
  | (PageSurfaceSectionBaseSpec & { kind: "document"; surface: DocumentSurfaceProps })
  | (PageSurfaceSectionBaseSpec & { kind: "form"; surface: FormSurfaceProps })
  | (PageSurfaceSectionBaseSpec & { kind: "visualization"; surface: VisualizationSurfaceProps })
  | (PageSurfaceSectionBaseSpec & { kind: "block"; surface: BlockSurfaceProps })
  | (PageSurfaceSectionBaseSpec & { kind: "navigation"; surface: NavigationSurfaceProps })
  | (PageSurfaceSectionBaseSpec & ({ kind: "modal" } & PageSurfaceModalSpec))
  | (PageSurfaceSectionBaseSpec & {
      kind: "sections";
      layout?: "stack" | "grid";
      sectioning?: PageSurfaceSectioningSpec;
      sections: PageSurfaceSectionSpec[];
    });

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
  empty?: PageSurfaceEmptySpec;
  commands?: PageSurfaceCommandSpec[];
}

export interface PageSurfaceSplitPaneSpec {
  title?: ReactNode;
  width?: "sm" | "md" | "lg";
  sections?: PageSurfaceSectionSpec[];
  drawerSections?: PageSurfaceSectionSpec[];
}

export interface PageSurfaceSplitBodySpec {
  kind: "split";
  left: PageSurfaceSplitPaneSpec;
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
