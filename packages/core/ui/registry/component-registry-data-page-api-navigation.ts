import type { CoreUiComponentRegistration } from "./component-registry-types";
import { generatedCoreUiSurfaceContracts } from "./generated-surface-contracts";

export const navigation_registry_entries = [
  {
    name: "NavigationRenderer",
    description: "页面导航 renderer / 正文导航 primitive",
    contract: generatedCoreUiSurfaceContracts.NavigationRenderer,
    composes: ["TabBar", "Pagination", "SelectorPanel", "SelectionGrid", "DisclosureSectionHeader"],
  },
] as const satisfies readonly CoreUiComponentRegistration[];
