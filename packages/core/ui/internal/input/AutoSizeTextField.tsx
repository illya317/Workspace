"use client";

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

export interface AutoSizeTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  minWidth?: number;
  maxWidth?: number;
}

const AutoSizeTextField = forwardRef<HTMLInputElement, AutoSizeTextFieldProps>(
  ({ minWidth = 100, maxWidth = 400, className, style, value, ...props }, ref) => {
    const measureRef = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState(minWidth);

    useEffect(() => {
      if (!measureRef.current) return;
      const rect = measureRef.current.getBoundingClientRect();
      setWidth(Math.min(maxWidth, Math.max(minWidth, rect.width + 30)));
    }, [value, minWidth, maxWidth]);

    const inputValue = String(value ?? "");

    return (
      <>
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

AutoSizeTextField.displayName = "AutoSizeTextField";

export default AutoSizeTextField;
