"use client";

import { ActionButton } from "../action/ActionControls";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import CommandButton from "../common/CommandButton";
import type { FormSurfaceCommandSpec } from "../../FormSurface.types";

function labelText(label: FormSurfaceCommandSpec["label"]) {
  if (typeof label === "string" || typeof label === "number") return String(label);
  return "";
}

function resolveCommandIcon(command: FormSurfaceCommandSpec): ActionGlyphKind | null {
  if (command.icon) return command.icon;
  const key = command.key.toLowerCase();
  const label = labelText(command.label);
  if (key.includes("cancel") || key.includes("close") || label.includes("取消") || label.includes("关闭")) return "cancel";
  if (key.includes("refresh") || key.includes("retry") || label.includes("刷新") || label.includes("重试")) return "refresh";
  if (key.includes("save") || label.includes("保存")) return "save";
  if (key.includes("delete") || label.includes("删除")) return "delete-bin";
  if (key.includes("download") || label.includes("下载") || label.includes("导出")) return "download";
  if (key.includes("upload") || label.includes("上传") || label.includes("导入")) return "upload";
  if (key.includes("create") || key.includes("add") || label.includes("新建") || label.includes("创建") || label.includes("添加")) return "add";
  if (command.type === "submit" || key.includes("submit") || label.includes("确认") || label.includes("应用")) return "check";
  return null;
}

export function renderCommands(commands?: FormSurfaceCommandSpec[]) {
  if (!commands?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((command) => {
        const icon = command.presentation === "text" ? null : resolveCommandIcon(command);
        if (icon) {
          return (
            <ActionButton
              key={command.key}
              kind={icon}
              label={labelText(command.label) || command.key}
              type={command.type}
              variant={command.variant}
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
