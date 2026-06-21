import type { ReactNode } from "react";

export function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-medium text-slate-400">组件实例</div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        {children}
      </div>
    </div>
  );
}
