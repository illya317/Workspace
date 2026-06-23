"use client";

import { joinClassNames } from "./card-utils";

export interface RatingControlProps {
  value: number;
  label: string;
  max?: number;
  readOnly?: boolean;
  showLabel?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}

export default function RatingControl({
  value,
  label,
  max = 5,
  readOnly = false,
  showLabel = true,
  onChange,
  className = "",
}: RatingControlProps) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);

  return (
    <div className={joinClassNames("flex items-center gap-2", className)}>
      {showLabel && <span className="text-xs font-medium text-slate-500">{label}</span>}
      <div
        className={joinClassNames(
          "inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1",
          readOnly && "h-8 border-slate-100 bg-slate-100/80",
        )}
        aria-label={label}
      >
        {scores.map((score) => (
          <button
            key={score}
            type="button"
            disabled={readOnly}
            aria-label={`${label} ${score}`}
            aria-pressed={score <= value}
            title={`${label} ${score}`}
            onClick={() => onChange?.(score)}
            className={joinClassNames(
              "grid place-items-center rounded-md text-xs font-semibold leading-none transition",
              readOnly ? "h-6 w-6" : "h-8 w-8",
              score <= value
                ? readOnly
                  ? "bg-slate-700 text-white"
                  : "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400",
              !readOnly && "cursor-pointer hover:bg-white hover:text-slate-900",
              readOnly && "cursor-default",
            )}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}
