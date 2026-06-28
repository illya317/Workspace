"use client";

import DropdownSurface, { getDropdownItemClassName } from "./DropdownSurface";
import { CONTROL_SIZES } from "./interactionTokens";
import type { ControlSize } from "./interactionTokens";
import type { ToolbarMenuItem, ToolbarOptionGroupItem } from "./Toolbar.types";
import { joinClassNames } from "./card-utils";

function getShortTextLength(label: ToolbarOptionGroupItem["options"][number]["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label).length;
  return null;
}

export function resolveToolbarOptionGroupPresentation(item: ToolbarOptionGroupItem) {
  if (item.options.length < 2 || item.options.length > 3) return "accordion";

  let totalLength = typeof item.label === "string" ? item.label.length : item.ariaLabel?.length ?? 0;
  for (const option of item.options) {
    const length = getShortTextLength(option.label);
    if (length === null || length > 6) return "accordion";
    totalLength += length;
  }

  return totalLength <= 18 ? "segmented" : "accordion";
}

function renderToolbarMenuTrigger(
  item: ToolbarMenuItem,
  open: boolean,
  toggle: () => void,
  size: ControlSize,
) {
  const trigger = item.trigger;
  return (
    <button
      type="button"
      aria-label={trigger.ariaLabel ?? trigger.label}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={item.disabled}
      onClick={toggle}
      className={joinClassNames(
        "inline-flex items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        CONTROL_SIZES[size].height,
      )}
    >
      {trigger.avatarUrl ? (
        <span
          className="h-7 w-7 rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${trigger.avatarUrl})` }}
          aria-hidden="true"
        />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">
          {trigger.initials || trigger.label.slice(0, 1) || "?"}
        </span>
      )}
      <span className="max-w-28 truncate">{trigger.label}</span>
      <span
        className={joinClassNames("text-xs leading-none text-slate-400 transition-transform", open && "rotate-180")}
        aria-hidden="true"
      >
        v
      </span>
    </button>
  );
}

export function renderToolbarMenu(item: ToolbarMenuItem, size: ControlSize) {
  return (
    <DropdownSurface
      align={item.align ?? "right"}
      surfaceClassName="w-36 py-1"
      trigger={({ open, toggle }) => renderToolbarMenuTrigger(item, open, toggle, size)}
    >
      {({ close }) => (
        <div role="menu">
          {item.items.map((menuItem) => {
            const className = joinClassNames(
              getDropdownItemClassName({ tone: menuItem.tone }),
              menuItem.disabled && "pointer-events-none opacity-50",
            );
            return (
              <div key={menuItem.key}>
                {menuItem.separatorBefore && <div className="mx-2 my-1 border-t border-gray-100" />}
                {menuItem.href && !menuItem.disabled && !menuItem.onSelect ? (
                  <a href={menuItem.href} role="menuitem" onClick={close} className={className}>
                    {menuItem.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={menuItem.disabled}
                    onClick={() => {
                      if (menuItem.disabled) return;
                      close();
                      void menuItem.onSelect?.();
                    }}
                    className={className}
                  >
                    {menuItem.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DropdownSurface>
  );
}
