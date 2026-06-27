import type { PageSurfaceProps } from "@workspace/core/ui";

export type RosterSurfaceNavigationProps = Pick<
  PageSurfaceProps,
  "tabs" | "activeTab" | "activeChild" | "onTabChange" | "onChildChange"
>;
