import type { ReactNode } from "react";

export default function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}
