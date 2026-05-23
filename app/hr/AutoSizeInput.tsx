"use client";

import React, { useRef, useEffect, useState, forwardRef } from "react";

interface AutoSizeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  minWidth?: number;
  maxWidth?: number;
}

export const AutoSizeInput = forwardRef<HTMLInputElement, AutoSizeInputProps>(
  ({ minWidth = 100, maxWidth = 400, className, style, value, ...props }, ref) => {
    const measureRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState(minWidth);

    useEffect(() => {
      if (measureRef.current) {
        const rect = measureRef.current.getBoundingClientRect();
        // padding(8+8) + border(1+1) + cursor margin
        const totalWidth = rect.width + 8 + 8 + 1 + 1 + 12;
        setWidth(Math.min(maxWidth, Math.max(minWidth, totalWidth)));
      }
    }, [value, minWidth, maxWidth]);

    const inputValue = String(value ?? "");

    return (
      <>
        {/* Hidden measurement span — same font styling as the input */}
        <span
          ref={measureRef}
          className="invisible absolute whitespace-pre px-2 text-sm"
          style={{ fontFamily: "inherit" }}
          aria-hidden="true"
        >
          {inputValue || "\u00A0"}
        </span>
        <input
          ref={ref}
          value={value}
          style={{ ...style, width: `${width}px` }}
          className={`rounded border border-emerald-400 px-2 py-1.5 text-sm focus:outline-none ${className || ""}`}
          {...props}
        />
      </>
    );
  }
);
AutoSizeInput.displayName = "AutoSizeInput";
