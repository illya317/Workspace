import type { ReactNode } from "react";
import type { BodySurfaceProps } from "./BodySurface";
import type { SurfaceToolbarItems } from "./SurfaceContractTypes";

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
