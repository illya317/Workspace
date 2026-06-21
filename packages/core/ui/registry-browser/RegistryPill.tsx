import type { ReactNode } from "react";

export function RegistryPill({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-xs ${
        muted
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : "border-emerald-100 bg-emerald-50 text-emerald-700"
      }`}
    >
      {children}
    </span>
  );
}
