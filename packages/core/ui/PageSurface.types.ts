import type { ReactNode, Ref } from "react";
import type { ModuleCardColor } from "./Card";
import type { CommandButtonProps } from "./CommandButton";
import type { DataSurfaceProps } from "./DataSurface.types";
import type { DocumentSurfaceProps } from "./DocumentSurface";
import type { FormSurfaceProps } from "./FormSurface.types";
import type { NavigationSurfaceProps } from "./NavigationSurface";
import type { PaginationProps } from "./Pagination";
import type { TabDef } from "./TabBar";
import type { ToolbarProps } from "./Toolbar";

export type PageSurfaceKind = "list" | "detail" | "split" | "analysis" | "settings";

export type PageSurfaceToolbarSpec = Omit<ToolbarProps, "items"> & {
  items: ToolbarProps["items"];
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
  pagination?: PaginationProps;
  className?: string;
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

export interface PageSurfaceMessageSpec {
  key: string;
  content: ReactNode;
  tone?: "default" | "muted" | "success" | "warning" | "danger";
  className?: string;
}

export interface PageSurfaceMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

export interface PageSurfaceActionBlockSpec {
  kind: "actions";
  key: string;
  actions: PageSurfaceCommandSpec[];
  className?: string;
}

export interface PageSurfaceHeadingSpec {
  key: string;
  title: ReactNode;
  subtitle?: ReactNode;
  level?: 1 | 2 | 3;
  className?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}

export interface PageSurfaceModuleGridItemSpec {
  key: string;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  color?: ModuleCardColor;
  href?: string;
  onClick?: () => void;
  badge?: string;
  className?: string;
}

export interface PageSurfaceModuleGridSpec {
  key: string;
  title?: ReactNode;
  summary?: ReactNode;
  leading?: ReactNode;
  afterGrid?: ReactNode;
  fullScreen?: boolean;
  centered?: boolean;
  className?: string;
  contentClassName?: string;
  gridClassName?: string;
  items: PageSurfaceModuleGridItemSpec[];
}

export interface PageSurfacePanelSpec {
  key: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: PageSurfaceCommandSpec[];
  blocks: PageSurfaceBlockSpec[];
  itemRef?: Ref<HTMLDivElement>;
  className?: string;
  bodyClassName?: string;
}

export interface PageSurfaceSectionSpec extends PageSurfacePanelSpec {
  title: ReactNode;
}

export interface PageSurfaceAnalysisSpec extends PageSurfaceSectionSpec {
  toolbar?: PageSurfaceToolbarSpec;
}

export interface PageSurfaceGroupSpec {
  key: string;
  blocks: PageSurfaceBlockSpec[];
  layout?: "stack" | "grid";
  className?: string;
}

export interface PageSurfaceModuleViewSpec {
  key: string;
  view: ReactNode;
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
  | ({ kind: "empty"; key: string } & PageSurfaceEmptySpec)
  | ({ kind: "message" } & PageSurfaceMessageSpec)
  | ({ kind: "heading" } & PageSurfaceHeadingSpec)
  | { kind: "metrics"; key: string; metrics: PageSurfaceMetricSpec[]; className?: string }
  | PageSurfaceActionBlockSpec
  | ({ kind: "moduleGrid" } & PageSurfaceModuleGridSpec)
  | { kind: "data"; key: string; surface: DataSurfaceProps }
  | { kind: "document"; key: string; surface: DocumentSurfaceProps }
  | { kind: "form"; key: string; surface: FormSurfaceProps }
  | { kind: "navigation"; key: string; surface: NavigationSurfaceProps }
  | ({ kind: "analysis" } & PageSurfaceAnalysisSpec)
  | ({ kind: "surfaceGroup" } & PageSurfaceGroupSpec)
  | ({ kind: "moduleView" } & PageSurfaceModuleViewSpec)
  | ({ kind: "modal" } & PageSurfaceModalSpec)
  | ({ kind: "panel" } & PageSurfacePanelSpec)
  | ({ kind: "section" } & PageSurfaceSectionSpec);

export interface PageSurfaceSideSpec {
  blocks: PageSurfaceBlockSpec[];
  drawerBlocks?: PageSurfaceBlockSpec[];
  className?: string;
}

interface PageSurfaceBaseProps {
  kind: PageSurfaceKind;
  header?: PageSurfaceHeaderSpec;
  navigation?: PageSurfaceNavigationSpec;
  tabs?: TabDef[];
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
    content?: ReactNode;
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
