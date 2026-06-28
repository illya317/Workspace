import type { MouseEventHandler, ReactNode } from "react";

type FixedPositionBoxProps = {
  className?: string;
  top: number;
  left: number;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  children: ReactNode;
};

export function FixedPositionBox({ className, top, left, onMouseEnter, onMouseLeave, children }: FixedPositionBoxProps) {
  return <div className={className} style={{ top, left }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{children}</div>;
}
