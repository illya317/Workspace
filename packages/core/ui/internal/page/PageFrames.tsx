"use client";

import type { ReactNode } from "react";
import PageContent from "./PageContent";
import { PAGE_SURFACE_STACK_CLASS } from "./PageSurface.spacing";

export interface DatabasePageFrameProps {
  navigation?: ReactNode;
  toolbar?: ReactNode;
  afterToolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DatabasePageFrame({
  navigation,
  toolbar,
  afterToolbar,
  footer,
  children,
}: DatabasePageFrameProps) {
  return (
    <PageContent>
      <div className={PAGE_SURFACE_STACK_CLASS}>
        {navigation}
        {toolbar}
        {afterToolbar}
        {children}
        {footer}
      </div>
    </PageContent>
  );
}
