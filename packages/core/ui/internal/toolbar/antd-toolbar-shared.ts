import type { ControlSize } from "../common/interactionTokens";

/** legacy ControlSize → antd 控件尺寸。 */
export function antdControlSize(size: ControlSize): "small" | "medium" | "large" {
  if (size === "sm") return "small";
  if (size === "md") return "medium";
  return "large";
}

/**
 * legacy visibleCount(下拉可见选项行数) → antd listHeight(像素)。
 * antd 选项行高 32px,按行数换算,语义等价。
 */
export function listHeightFromVisibleCount(visibleCount?: number) {
  return visibleCount ? visibleCount * 32 : undefined;
}
