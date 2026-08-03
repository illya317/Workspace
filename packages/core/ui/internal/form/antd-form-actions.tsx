"use client";

import { Button, Flex } from "antd";
import {
  ACTION_GLYPH_ACTION_BY_KEY,
  ACTION_GLYPH_ORDER_BY_KIND,
  ActionGlyph,
  resolveActionGlyphAction,
} from "../action/ActionGlyphs";
import { isFormSurfaceNativeSubmitAction } from "./form-surface-submit";
import type {
  FormSurfaceActionSpec,
  FormSurfaceCommandSpec,
} from "../../FormSurface.types";

function actionOrder(action: FormSurfaceActionSpec) {
  const definition = ACTION_GLYPH_ACTION_BY_KEY[action.action];
  return ACTION_GLYPH_ORDER_BY_KIND[definition.icon].order;
}

function labelText(label: FormSurfaceCommandSpec["label"]) {
  return typeof label === "string" || typeof label === "number" ? String(label) : "";
}

function buttonType(variant: "primary" | "secondary" | "danger" | undefined) {
  return variant === "primary" ? "primary" as const : "default" as const;
}

export function AntdFormCommands({ commands }: { commands?: FormSurfaceCommandSpec[] }) {
  if (!commands?.length) return null;
  return (
    <Flex wrap gap="small" align="center" data-antd-form-commands="true">
      {commands.map((command) => {
        const text = labelText(command.label);
        const action = command.icon
          ? undefined
          : resolveActionGlyphAction({ key: command.key, label: text, type: command.type });
        const icon = command.presentation === "text" ? null : command.icon ?? action?.icon ?? null;
        const variant = command.variant ?? action?.variant;
        const nativeSubmit = command.type === "submit" && !command.onClick;
        return (
          <Button
            autoInsertSpace={false}
            aria-label={icon ? text || command.key : undefined}
            danger={variant === "danger"}
            disabled={command.disabled}
            htmlType={nativeSubmit ? "submit" : "button"}
            icon={icon ? <ActionGlyph kind={icon} className="size-4" /> : undefined}
            key={command.key}
            onClick={command.onClick}
            size={command.size === "sm" ? "small" : command.size === "lg" || command.size === "xl" ? "large" : "middle"}
            title={icon ? text || command.key : undefined}
            type={buttonType(variant)}
          >
            {icon ? null : command.label}
          </Button>
        );
      })}
    </Flex>
  );
}

export function AntdFormActions({
  actions,
  compact,
  login,
}: {
  actions?: FormSurfaceActionSpec[];
  compact?: boolean;
  login?: boolean;
}) {
  if (!actions?.length) return null;
  const ordered = [...actions].sort((left, right) => actionOrder(left) - actionOrder(right));
  return (
    <Flex
      vertical={login}
      wrap={!login}
      gap={login ? "middle" : "small"}
      align={login ? "stretch" : "center"}
      justify="flex-end"
      data-antd-form-actions="true"
    >
      {ordered.map((action) => {
        const definition = ACTION_GLYPH_ACTION_BY_KEY[action.action];
        const label = action.label ?? definition.label;
        const nativeSubmit = isFormSurfaceNativeSubmitAction(action);
        return (
          <Button
            autoInsertSpace={false}
            aria-label={login ? undefined : label}
            block={login}
            danger={definition.variant === "danger"}
            disabled={action.disabled}
            htmlType={nativeSubmit ? "submit" : "button"}
            icon={login ? undefined : <ActionGlyph kind={definition.icon} className="size-4" />}
            key={action.key}
            onClick={action.onClick}
            size={login ? "large" : compact ? "small" : "middle"}
            title={login ? undefined : label}
            type={definition.variant === "primary" ? "primary" : "default"}
          >
            {login ? label : null}
          </Button>
        );
      })}
    </Flex>
  );
}
