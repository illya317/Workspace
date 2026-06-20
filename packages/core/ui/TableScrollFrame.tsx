import type { ReactNode } from "react";

export interface TableScrollFrameProps {
  children: ReactNode;
  className?: string;
}

export default function TableScrollFrame({ children, className = "" }: TableScrollFrameProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}
