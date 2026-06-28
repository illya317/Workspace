import type { ReactNode } from "react";
import type { BlockSurfaceProps } from "../BlockSurface";
import type { CommandButtonProps } from "../CommandButton";
import type { DataSurfaceProps } from "./DataSurface.types";
import type { DocumentSurfaceProps } from "../DocumentSurface";
import type { FormSurfaceProps } from "./FormSurface.types";
import type { NavigationSurfaceProps } from "../NavigationSurface";
import type { VisualizationSurfaceProps } from "../VisualizationSurface";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";

export type PageSurfaceKind = "list" | "detail" | "split" | "analysis" | "settings";

export type PageSurfaceToolbarSpec = {
  items: SurfaceToolbarItems;
  onSubmit?: () => void;
  hidden?: boolean;
};

export interface PageSurfaceHeaderSpec {
  hidden?: boolean;
  title?: ReactNode;
  backHref?: string;
  backLabel?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export interface PageSurfaceNavigationItemSpec {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: PageSurfaceNavigationItemSpec[];
}

export interface PageSurfaceNavigationSpec {
  kind: "cards" | "tabs";
  level: 1 | 2;
  items: PageSurfaceNavigationItemSpec[];
  active: string;
  activeChild?: string;
  onChange: (key: string) => void;
  onChildChange?: (key: string) => void;
  hidden?: boolean;
  className?: string;
}

export interface PageSurfaceFooterSpec {
  hidden?: boolean;
  pagination?: PageSurfacePaginationSpec;
  className?: string;
}

export interface PageSurfacePaginationSpec {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
  compact?: boolean;
}

export interface PageSurfaceCommandSpec {
  key: string;
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: CommandButtonProps["size"];
  className?: string;
  truncate?: boolean;
}

export interface PageSurfaceEmptySpec {
  presentation?: "card" | "plain";
  content: ReactNode;
  compact?: boolean;
  className?: string;
}

export interface PageSurfaceModalSpec {
  key: string;
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  blocks: PageSurfaceBlockSpec[];
  className?: string;
  bodyClassName?: string;
}

export type PageSurfaceBlockSpec =
  | { kind: "data"; key: string; surface: DataSurfaceProps }
  | { kind: "document"; key: string; surface: DocumentSurfaceProps }
  | { kind: "form"; key: string; surface: FormSurfaceProps }
  | { kind: "visualization"; key: string; surface: VisualizationSurfaceProps }
  | { kind: "block"; key: string; surface: BlockSurfaceProps }
  | { kind: "navigation"; key: string; surface: NavigationSurfaceProps }
  | ({ kind: "modal" } & PageSurfaceModalSpec);

export interface PageSurfaceSideSpec {
  blocks: PageSurfaceBlockSpec[];
  drawerBlocks?: PageSurfaceBlockSpec[];
  className?: string;
}

interface PageSurfaceBaseProps {
  kind: PageSurfaceKind;
  header?: PageSurfaceHeaderSpec;
  navigation?: PageSurfaceNavigationSpec;
  tabs?: PageSurfaceNavigationItemSpec[];
  activeTab?: string;
  activeChild?: string;
  onTabChange?: (tab: string) => void;
  onChildChange?: (child: string) => void;
  toolbar?: PageSurfaceToolbarSpec;
  footer?: PageSurfaceFooterSpec;
  actions?: PageSurfaceCommandSpec[];
  empty?: PageSurfaceEmptySpec;
  blocks?: PageSurfaceBlockSpec[];
  body?: {
    layout?: "single" | "split";
    blocks?: PageSurfaceBlockSpec[];
  };
  embedded?: boolean;
  className?: string;
  contentClassName?: string;
}

export interface PageSurfaceStandardProps extends PageSurfaceBaseProps {
  kind: Exclude<PageSurfaceKind, "split">;
}

export interface PageSurfaceSplitProps extends PageSurfaceBaseProps {
  kind: "split";
  sideOpen: boolean;
  drawerOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  sideLabel: string;
  side: PageSurfaceSideSpec;
  showSideControls?: boolean;
  splitRatio?: readonly [number, number];
}

export type PageSurfaceProps = PageSurfaceStandardProps | PageSurfaceSplitProps;
