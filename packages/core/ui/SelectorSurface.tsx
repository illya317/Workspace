"use client";

import { AntdSelectorSurface } from "./internal/selection/antd-selection";
import { useSplitWorkspaceMasterPresentation } from "./internal/common/SplitWorkspaceMasterContext";
import { renderAntdCommands } from "./internal/common/antd-command";
import type { SelectorSurfaceProps } from "./SelectorSurface.types";

export { resolveSelectorCardPresentation } from "./internal/selection/selector-split-presentation";

/** SelectorSurface is a thin total Ant facade; it never constructs an alternate renderer. */
export default function SelectorSurface<T>(selector: SelectorSurfaceProps<T>) {
  const presentation = useSplitWorkspaceMasterPresentation();
  return <AntdSelectorSurface actions={renderAntdCommands(selector.commands)} presentation={presentation} selector={selector} />;
}
