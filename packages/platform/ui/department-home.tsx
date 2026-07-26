"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import {
  PageSurface,
  type BodySurfaceProps,
  type BodySurfaceSelectorProps,
  type PageSurfaceFooterSpec,
  type PageSurfaceTabBarSpec,
  type SurfaceToolbarItems,
} from "@workspace/core/ui";
import { createSpaceWorkbenchBody } from "./space-workbench";

type DepartmentHomeViewContributionBase = {
  key: string;
  label: string;
  order: number;
};

export type DepartmentHomeViewContribution = DepartmentHomeViewContributionBase & (
  | { component: ComponentType<{ departmentId: number }>; href?: never }
  | { component?: never; href: string }
);

export type DepartmentHomeViewLayout = {
  tabbar: PageSurfaceTabBarSpec;
  left: BodySurfaceSelectorProps;
  toolbarItems: SurfaceToolbarItems;
  masterLabel?: string;
  ratio?: [number, number];
};

const DepartmentHomeViewLayoutContext = createContext<DepartmentHomeViewLayout | null>(null);

export function DepartmentHomeViewLayoutProvider({
  value,
  children,
}: {
  value: DepartmentHomeViewLayout;
  children: ReactNode;
}) {
  return (
    <DepartmentHomeViewLayoutContext.Provider value={value}>
      {children}
    </DepartmentHomeViewLayoutContext.Provider>
  );
}

export function useDepartmentHomeViewLayout() {
  const value = useContext(DepartmentHomeViewLayoutContext);
  if (!value) throw new Error("Department home view must be rendered inside DepartmentHomeViewLayoutProvider");
  return value;
}

export function DepartmentHomeViewSurface({
  right,
  toolbarItems = [],
  footer,
  assistant = true,
}: {
  right: BodySurfaceProps;
  toolbarItems?: SurfaceToolbarItems;
  footer?: PageSurfaceFooterSpec;
  assistant?: boolean;
}) {
  const layout = useDepartmentHomeViewLayout();
  return (
    <PageSurface
      kind="standard"
      tabbar={layout.tabbar}
      toolbar={{ items: [...layout.toolbarItems, ...toolbarItems], assistant }}
      body={createSpaceWorkbenchBody({
        left: layout.left,
        right,
        label: layout.masterLabel ?? "组织层级",
        ratio: layout.ratio ?? [0.32, 0.68],
      })}
      footer={footer}
    />
  );
}
