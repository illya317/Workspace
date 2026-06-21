import type { FormEvent, ReactNode } from "react";
import { joinClassNames } from "./card-utils";

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

export default function FilterBar({ children, className = "", onSubmit }: FilterBarProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
      className={joinClassNames("flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm", className)}
    >
      {children}
    </form>
  );
}
