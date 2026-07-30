import type { DataSurfaceDisplaySpec } from "../../DataSurface.types";

type DataSurfaceMeterSpec = Extract<DataSurfaceDisplaySpec, { kind: "meter" }>;

export function DataSurfaceMeter({ spec }: { spec: DataSurfaceMeterSpec }) {
  const percent = spec.max > 0
    ? Math.min(100, Math.max(0, (spec.value / spec.max) * 100))
    : 0;
  return (
    <span
      className="relative block min-w-20 overflow-hidden rounded-sm px-1.5 py-0.5 text-right font-mono tabular-nums text-slate-800"
      title={spec.title}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-emerald-100/80"
        style={{ width: `${percent}%` }}
      />
      <span className="relative">{spec.label}</span>
    </span>
  );
}
