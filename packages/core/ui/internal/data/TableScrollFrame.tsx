import type { ReactNode } from "react";
import type { DataSurfaceFrame, DataSurfaceScrollSpec } from "../../DataSurface.types";
import { resolveSurfaceFrameClass } from "./table-presentation";

export interface TableScrollFrameProps {
  children: ReactNode;
  frame?: DataSurfaceFrame;
  scroll?: DataSurfaceScrollSpec;
}

export default function TableScrollFrame({ children, frame, scroll }: TableScrollFrameProps) {
  return (
    <div className={resolveSurfaceFrameClass(frame, scroll)}>
      {children}
    </div>
  );
}
