import type { BodySurfaceProps } from "./BodySurface";
import type { NavigationSurfaceItemSpec, NavigationSurfaceScopeProps, NavigationSurfaceTabsProps } from "./NavigationSurface";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";

export type PageSurfaceKind = "login" | "directory" | "standard";

export type PageSurfaceToolbarSpec = {
  items: SurfaceToolbarItems;
  onSubmit?: () => void;
  hidden?: boolean;
};

export type PageSurfaceNavigationItemSpec = NavigationSurfaceItemSpec;
export type PageSurfaceNavigationSpec = NavigationSurfaceTabsProps | NavigationSurfaceScopeProps;

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

export type PageSurfaceBodySpec = BodySurfaceProps;

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
