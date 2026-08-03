"use client";

import { Button, Space } from "antd";
import type { ReactNode } from "react";
import { ActionGlyph, resolveActionGlyphAction, resolveActionGlyphIcon, type ActionGlyphKind } from "../action/ActionGlyphs";
import { useBodySurfaceRevealIntent } from "../body/BodySurfaceRevealContext";

export interface AntdCommandSpec {
  key: string;
  label: ReactNode;
  title?: string;
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

function buttonSize(size?: AntdCommandSpec["size"]): "small" | "medium" | "large" {
  if (size === "sm") return "small";
  if (size === "lg" || size === "xl") return "large";
  return "medium";
}

function labelText(label: ReactNode) {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

export function AntdCommandList({ commands }: { commands?: AntdCommandSpec[] }) {
  const requestReveal = useBodySurfaceRevealIntent();
  if (!commands?.length) return null;
  return (
    <Space wrap size={8} data-ui-renderer="antd">
      {commands.map((command) => {
        const text = labelText(command.label);
        const inferred = resolveActionGlyphAction({ key: command.key, label: text, type: command.type });
        const iconKind = command.presentation === "text" ? null : resolveActionGlyphIcon(command.icon) ?? inferred?.icon ?? null;
        const iconOnly = command.presentation === "icon";
        return (
          <Button
            aria-label={iconOnly ? text || command.key : undefined}
            danger={command.variant === "danger" || inferred?.variant === "danger"}
            disabled={command.disabled}
            htmlType={command.type === "submit" && !command.onClick ? "submit" : "button"}
            icon={iconKind ? <ActionGlyph kind={iconKind} className="size-4" /> : undefined}
            key={command.key}
            onClick={() => {
              if (!command.disabled && command.type !== "submit" && command.revealTargetKey && (command.scrollOnCreate ?? true)) {
                requestReveal?.(command.revealTargetKey);
              }
              command.onClick?.();
            }}
            size={buttonSize(command.size)}
            title={command.title ?? (iconOnly ? text : undefined)}
            type={command.variant === "primary" || inferred?.variant === "primary" ? "primary" : "default"}
          >
            {iconOnly ? null : <span className={command.truncate ? "max-w-40 truncate" : undefined}>{command.label}</span>}
          </Button>
        );
      })}
    </Space>
  );
}

export function renderAntdCommands(commands?: AntdCommandSpec[]) {
  return <AntdCommandList commands={commands} />;
}
