"use client";

import type { ReactNode } from "react";
import { ActionButton } from "../action/ActionControls";
import { resolveActionGlyphAction, resolveActionGlyphIcon, type ActionGlyphKind } from "../action/ActionGlyphs";
import { useBodySurfaceRevealIntent } from "../body/BodySurfaceRevealContext";
import CommandButton from "../common/CommandButton";

export interface SurfaceCommandRenderSpec {
  key: string;
  label: ReactNode;
  icon?: ActionGlyphKind | "back" | "create" | "open";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: "sm" | "md" | "lg" | "xl";
  presentation?: "auto" | "text" | "icon";
  truncate?: boolean;
  scrollOnCreate?: boolean;
  revealTargetKey?: string;
}

function labelText(label: SurfaceCommandRenderSpec["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "";
}

export function renderCommands(commands?: SurfaceCommandRenderSpec[]) {
  if (!commands?.length) return null;
  return <CommandList commands={commands} />;
}

function CommandList({ commands }: { commands: SurfaceCommandRenderSpec[] }) {
  const requestReveal = useBodySurfaceRevealIntent();
  const runCommand = (command: SurfaceCommandRenderSpec) => {
    if (shouldRequestReveal(command)) requestReveal?.(command.revealTargetKey ?? command.key);
    command.onClick?.();
  };
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
              onClick={() => runCommand(command)}
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
            onClick={() => runCommand(command)}
          >
            {command.label}
          </CommandButton>
        );
      })}
    </div>
  );
}

function shouldRequestReveal(command: SurfaceCommandRenderSpec) {
  if (command.disabled || command.type === "submit" || !command.revealTargetKey) return false;
  return command.scrollOnCreate ?? true;
}
