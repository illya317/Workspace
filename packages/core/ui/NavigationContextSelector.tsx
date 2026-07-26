"use client";

import NavigationSurface from "./NavigationSurface";
import type { NavigationSurfaceSelectorSpec } from "./NavigationSurface.types";

export interface NavigationContextSelectorProps {
  selector: NavigationSurfaceSelectorSpec;
}

export default function NavigationContextSelector({ selector }: NavigationContextSelectorProps) {
  return <NavigationSurface kind="context-selector" selector={selector} />;
}
