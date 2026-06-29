"use client";

import type { ReactNode } from "react";
import { ActionButton } from "../action/ActionControls";
import { resolveActionGlyphAction, resolveActionGlyphIcon, type ActionGlyphKind } from "../action/ActionGlyphs";
import CommandButton from "../common/CommandButton";

export interface SurfaceCommandRenderSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: "sm" | "md" | "lg";
  presentation?: "auto" | "text" | "icon";
  truncate?: boolean;
}

function labelText(label: SurfaceCommandRenderSpec["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "";
}

export function renderCommands(commands?: SurfaceCommandRenderSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => {
        const text = labelText(command.label);
        const action = resolveActionGlyphAction({ key: command.key, label: text, type: command.type });
        const icon = command.presentation === "text" ? null : resolveActionGlyphIcon(command.icon) ?? action?.icon ?? null;
        if (icon) {
          return (
            <ActionButton
              key={command.key}
              kind={icon}
              label={text || command.key}
              type={command.type}
              variant={command.variant ?? action?.variant}
              disabled={command.disabled}
              size={command.size}
              onClick={command.onClick}
            />
          );
        }
        return (
          <CommandButton
            key={command.key}
            type={command.type}
            variant={command.variant}
            disabled={command.disabled}
            size={command.size}
            truncate={command.truncate}
            onClick={command.onClick}
          >
            {command.label}
          </CommandButton>
        );
      })}
    </div>
  );
}
