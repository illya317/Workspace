import type { PageSurfaceProps, SurfaceToolbarItems, SurfaceToolbarActionGroupActionSpec } from "@workspace/core/ui";

export type RosterSurfaceTabBarProps = Pick<
  PageSurfaceProps,
  "tabbar"
> & {
  assistantAction?: SurfaceToolbarActionGroupActionSpec;
};

export function rosterAssistantToolbarItems(surface?: RosterSurfaceTabBarProps): SurfaceToolbarItems {
  return surface?.assistantAction
    ? [{ kind: "action-group", key: "assistant-actions", actions: [surface.assistantAction] }]
    : [];
}
