"use client";

import { ActionButton } from "../action/ActionControls";
import { resolveActionGlyphAction } from "../action/ActionGlyphs";
import CommandButton from "../common/CommandButton";
import type { FormSurfaceCommandSpec } from "../../FormSurface.types";

function labelText(label: FormSurfaceCommandSpec["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "";
}

export function renderCommands(commands?: FormSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => {
        const action = command.icon
          ? undefined
          : resolveActionGlyphAction({ key: command.key, label: labelText(command.label), type: command.type });
        const icon = command.presentation === "text" ? null : command.icon ?? action?.icon ?? null;
        if (icon) {
          return (
            <ActionButton
              key={command.key}
              kind={icon}
              label={labelText(command.label) || command.key}
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
