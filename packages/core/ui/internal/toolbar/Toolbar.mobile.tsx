"use client";

import { useCallback, useState } from "react";
import type { ControlSize } from "../common/interactionTokens";
import type { ToolbarGroupedItems } from "./Toolbar.layout";
import { resolveMobileToolbarModel, type MobileToolbarCommand } from "./Toolbar.mobile-model-utils";
import {
  MobileToolbarActionList,
  MobileToolbarControlList,
  MobileToolbarSheet,
} from "./Toolbar.mobile-sheetParts";
import {
  AntdToolbarActionButton,
  AntdToolbarItemRenderer,
  type ToolbarItemRendererComponent,
} from "./antd-toolbar";
import {
  resolveToolbarActionIcon,
  resolveToolbarActionVariant,
  type ToolbarRenderableAction,
} from "./toolbar-action-model";
import type { ToolbarItem } from "./Toolbar.types";

type MobileToolbarSheet = "filters" | "more" | null;

export default function MobileToolbarContent({
  grouped,
  size,
  onSubmit,
  renderItem: RenderItem = AntdToolbarItemRenderer,
}: {
  grouped: ToolbarGroupedItems;
  size: ControlSize;
  onSubmit?: () => void;
  renderItem?: ToolbarItemRendererComponent;
}) {
  const [sheet, setSheet] = useState<MobileToolbarSheet>(null);
  const model = resolveMobileToolbarModel(grouped);
  const closeSheet = useCallback(() => setSheet(null), []);
  const hasCommandDock = model.commands.length > 0 || model.hasFilters || model.hasMore;

  return (
    <div className="space-y-2.5">
      {grouped.search.length > 0 ? (
        <div className="grid gap-2">
          {grouped.search.map((item) => <RenderItem key={item.key} item={item} size={size} />)}
        </div>
      ) : null}

      {hasCommandDock ? <div className="grid min-w-0 grid-flow-col auto-cols-[2.75rem] justify-start gap-2" data-mobile-toolbar-command-dock="true">
        {model.commands.map((command, index) => (
          <MobileToolbarCommandButton key={commandKey(command, index)} command={command} size={size} />
        ))}
        {model.hasFilters ? (
          <MobileCommandButton
            icon="filter"
            label="筛选"
            active={sheet === "filters"}
            onClick={() => setSheet((current) => current === "filters" ? null : "filters")}
          />
        ) : null}
        {model.hasMore ? (
          <MobileCommandButton
            icon="more"
            label="更多"
            active={sheet === "more"}
            onClick={() => setSheet((current) => current === "more" ? null : "more")}
          />
        ) : null}
      </div> : null}

      <MobileToolbarSheet
        title={sheet === "filters" ? "筛选条件" : "更多操作"}
        open={sheet !== null}
        onClose={closeSheet}
      >
        {sheet === "filters" ? (
          <MobileToolbarControlList items={grouped.filter} size={size} onClose={closeSheet} renderItem={RenderItem} compact />
        ) : null}
        {sheet === "more" ? (
          <>
            <MobileToolbarActionList
              leadItems={model.overflowLeadItems}
              actions={model.overflowActions}
              onClose={closeSheet}
              onSubmit={onSubmit}
            />
            <MobileToolbarControlList
              title="显示与设置"
              items={grouped.trailing}
              size={size}
              onClose={closeSheet}
              renderItem={RenderItem}
            />
          </>
        ) : null}
      </MobileToolbarSheet>
    </div>
  );
}

function MobileToolbarCommandButton({
  command,
  size,
}: {
  command: MobileToolbarCommand;
  size: ControlSize;
}) {
  if (command.type === "lead") return <MobileLeadItem item={command.item} size={size} />;
  return <MobileActionButton action={command.action} />;
}

function MobileLeadItem({ item, size }: { item: ToolbarItem; size: ControlSize }) {
  if (item.kind !== "create") return <AntdToolbarItemRenderer item={item} size={size} />;
  // 移动端 create 默认文案为「新增」(桌面端为「新建」),保留该差异。
  return (
    <AntdToolbarActionButton
      kind="add"
      label={item.label ?? "新增"}
      disabled={item.disabled || item.active}
      onClick={item.onClick}
      variant={item.active ? "secondary" : "primary"}
      size={size}
    />
  );
}

function MobileActionButton({ action }: { action: ToolbarRenderableAction }) {
  const variant = resolveToolbarActionVariant(action) ?? "secondary";
  return (
    <AntdToolbarActionButton
      type={action.type ?? "button"}
      kind={resolveToolbarActionIcon(action)}
      label={action.label}
      disabled={action.disabled}
      onClick={action.onClick}
      variant={variant}
    />
  );
}

function MobileCommandButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: "filter" | "more";
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <AntdToolbarActionButton
      kind={icon}
      label={label}
      ariaExpanded={active}
      onClick={onClick}
      variant="secondary"
      className={active ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : undefined}
    />
  );
}

function commandKey(command: MobileToolbarCommand, index: number) {
  return command.type === "lead"
    ? `lead-${command.item.key}`
    : `action-${command.action.key ?? `${command.action.kind}-${index}`}`;
}
