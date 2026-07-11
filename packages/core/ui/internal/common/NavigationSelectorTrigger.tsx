"use client";

import { useState } from "react";
import type { NavigationSurfaceSelectorSpec } from "../../NavigationSurface.types";

interface NavigationSelectorTriggerProps {
  selector: NavigationSurfaceSelectorSpec;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

const TRIGGER_CLASSES = {
  root: "relative block",
  button: "inline-flex h-8 max-w-32 items-center gap-1.5 rounded-md border border-slate-100 bg-white/60 px-2.5 text-sm font-medium text-slate-500 shadow-none transition hover:border-emerald-100 hover:bg-emerald-50/50 hover:text-emerald-700 sm:max-w-44",
  closed: "",
  open: "border-emerald-100 bg-emerald-50/50 text-emerald-700",
  list: "w-44 border-slate-100",
  selected: "bg-emerald-50/70 text-emerald-700",
  option: "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
} as const;

export default function NavigationSelectorTrigger({
  selector,
}: NavigationSelectorTriggerProps) {
  const [open, setOpen] = useState(false);
  const activeOption = selector.options.find((option) => option.value === selector.value);
  const activeLabel = activeOption?.label ?? selector.label ?? selector.value;
  const visibleOptions = selector.visibleCount
    ? selector.options.slice(0, selector.visibleCount)
    : selector.options;
  const styles = TRIGGER_CLASSES;
  const ariaLabel = selector.label ?? "切换选项";

  return (
    <div
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className={joinClassNames(styles.button, open ? styles.open : styles.closed)}
        title={activeLabel}
      >
        <SwitchLeadingIcon />
        <span className="truncate">{activeLabel}</span>
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={joinClassNames("absolute left-0 top-full z-50 mt-2 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-1 shadow-lg", styles.list)}
        >
          {visibleOptions.map((option) => {
            const selected = option.value === selector.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => {
                  selector.onChange(option.value);
                  setOpen(false);
                }}
                className={joinClassNames(
                  "block w-full rounded-md px-3 py-2.5 text-left text-sm font-semibold leading-5 transition disabled:cursor-not-allowed disabled:text-slate-300",
                  selected ? styles.selected : styles.option,
                )}
                title={option.label}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SwitchLeadingIcon() {
  return (
    <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M118.656 438.656a32 32 0 0 1 0-45.248L416 96l4.48-3.776A32 32 0 0 1 461.248 96l3.712 4.48a32.064 32.064 0 0 1-3.712 40.832L218.56 384H928a32 32 0 1 1 0 64H141.248a32 32 0 0 1-22.592-9.344zM64 608a32 32 0 0 1 32-32h786.752a32 32 0 0 1 22.656 54.592L608 928l-4.48 3.776a32.064 32.064 0 0 1-40.832-49.024L805.632 640H96a32 32 0 0 1-32-32z"
      />
    </svg>
  );
}
