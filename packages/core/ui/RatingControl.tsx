"use client";

import { joinClassNames } from "./card-utils";

export interface RatingControlProps {
  value: number;
  label: string;
  max?: number;
  readOnly?: boolean;
  onChange?: (value: number) => void;
  className?: string;
}

export default function RatingControl({
  value,
  label,
  max = 5,
  readOnly = false,
  onChange,
  className = "",
}: RatingControlProps) {
  const scores = Array.from({ length: max }, (_, index) => index + 1);

  return (
    <div className={joinClassNames("flex items-center gap-2", className)}>
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex gap-0.5" aria-label={label}>
        {scores.map((score) => (
          <button
            key={score}
            type="button"
            disabled={readOnly}
            aria-label={`${label} ${score}`}
            aria-pressed={score <= value}
            onClick={() => onChange?.(score)}
            className={joinClassNames(
              "text-sm leading-none transition-colors",
              score <= value ? "text-amber-400" : "text-gray-300",
              !readOnly && "cursor-pointer hover:text-amber-500",
              readOnly && "cursor-default",
            )}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
