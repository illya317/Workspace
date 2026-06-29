"use client";

import { useState, type ReactNode } from "react";
import { CONTROL_GROUP_SIZES, getControlGroupClassName, getControlGroupItemClassName } from "../common/interactionTokens";
import type { ControlSize } from "../common/interactionTokens";
import { joinClassNames } from "../common/card-utils";

export interface ToolbarOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface ToolbarOptionGroupProps {
  value: string;
  options: ToolbarOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  size?: ControlSize;
  /** Toolbar-only compact mode: collapsed default shows the field label, selected values show their label. */
  presentation?: "segmented" | "accordion";
  defaultExpanded?: boolean;
}

export default function ToolbarOptionGroup({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  size = "md",
  presentation = "segmented",
  defaultExpanded = false,
}: ToolbarOptionGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isAccordion = presentation === "accordion";
  const containerClasses = isAccordion
    ? joinClassNames(
        CONTROL_GROUP_SIZES[size].containerHeight,
        CONTROL_GROUP_SIZES[size].containerRadius,
        "p-0",
      )
    : getControlGroupClassName(size);
  const itemClasses = getControlGroupItemClassName(size);
  const itemText = CONTROL_GROUP_SIZES[size].itemText;
  const activeOption = options.find((option) => option.value === value);
  const defaultOption = options[0];
  const parentOption = isAccordion && defaultOption
    ? {
        ...defaultOption,
        label: value === defaultOption.value ? (ariaLabel ?? defaultOption.label) : (activeOption?.label ?? ariaLabel ?? defaultOption.label),
      }
    : defaultOption;
  const childOptions = isAccordion ? options.slice(1) : options;
  const visibleOptions = isAccordion
    ? expanded && parentOption
      ? [parentOption, ...childOptions]
      : parentOption
        ? [parentOption]
        : []
    : options;

  function changeValue(nextValue: string) {
    onChange(nextValue);
    if (isAccordion) setExpanded(false);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onBlur={(event) => {
        if (!isAccordion) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
      className={joinClassNames("inline-flex flex-wrap items-center border border-slate-200 bg-slate-50 align-middle", containerClasses, className)}
    >
      {visibleOptions.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => {
              if (presentation === "accordion" && option.value === defaultOption?.value) {
                setExpanded((current) => !current);
                onChange(option.value);
                return;
              }
              changeValue(option.value);
            }}
            className={joinClassNames(
              "grid place-items-center font-semibold leading-none transition disabled:cursor-not-allowed disabled:text-slate-300",
              isAccordion
                ? joinClassNames(
                    CONTROL_GROUP_SIZES[size].containerHeight,
                    CONTROL_GROUP_SIZES[size].itemPaddingX,
                    CONTROL_GROUP_SIZES[size].containerRadius,
                  )
                : itemClasses,
              itemText,
              active || (isAccordion && option.value === defaultOption?.value && value !== defaultOption.value)
                ? isAccordion
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            <span className="-translate-y-px">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
