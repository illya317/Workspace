import type { BodySurfaceProps } from "./BodySurface.types";
import type { PageSurfaceCreateSpec } from "./CreateSurface.types";
import type { SurfacePaginationSpec, SurfaceToolbarItems } from "./SurfaceContractTypes";

export type { PageSurfaceCreateSpec } from "./CreateSurface.types";

export type PageSurfaceKind = "login" | "directory" | "standard";

export type PageSurfaceToolbarSpec = {
  items: SurfaceToolbarItems;
  onSubmit?: () => void;
  hidden?: boolean;
  /** Disable the implicit page-assistant button when the page provides its own assistant entry. */
  assistant?: boolean;
};

export interface PageSurfaceTabBarItemSpec {
  key: string;
  label: string;
  compactLabel?: string;
  children?: PageSurfaceTabBarItemSpec[];
}

export interface PageSurfaceTabBarSpec {
  kind: "tabs";
  items: PageSurfaceTabBarItemSpec[];
  active: string;
  activeChild?: string;
  onChange: (key: string) => void;
  onChildChange?: (key: string) => void;
  label?: string;
  variant?: "large" | "small";
  ariaLabel?: string;
}

export interface PageSurfaceFooterSpec {
  hidden?: boolean;
  pagination?: PageSurfacePaginationSpec;
}

export type PageSurfacePaginationSpec = SurfacePaginationSpec;

export type PageSurfaceBodySpec = BodySurfaceProps;

export interface PageSurfaceLoginBrandSpec {
  title: string;
  logo?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
}

interface PageSurfaceChromeProps {
  body?: PageSurfaceBodySpec;
  footer?: PageSurfaceFooterSpec;
}

export type PageSurfaceLoginProps = {
  kind: "login";
  body?: PageSurfaceBodySpec;
  brand: PageSurfaceLoginBrandSpec;
  create?: never;
  footer?: never;
  tabbar?: never;
  toolbar?: never;
};

export type PageSurfaceDirectoryProps = {
  kind: "directory";
  body?: PageSurfaceBodySpec;
  create?: never;
  footer?: never;
  tabbar?: never;
  toolbar?: never;
};

export type PageSurfaceStandardProps = PageSurfaceChromeProps & {
  kind?: "standard";
  create?: PageSurfaceCreateSpec;
  tabbar?: PageSurfaceTabBarSpec;
  toolbar?: PageSurfaceToolbarSpec;
};

export type PageSurfaceProps =
  | PageSurfaceLoginProps
  | PageSurfaceDirectoryProps
  | PageSurfaceStandardProps;
