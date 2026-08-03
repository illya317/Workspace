"use client";

import type { ReactNode } from "react";
import type { SelectorSurfaceProps } from "../../SelectorSurface.types";
import { AntdSelectorList } from "./antd-selection-list";
import { AntdSelectorTree } from "./antd-selection-tree";

export interface AntdSelectorSurfaceProps<T> {
  selector: SelectorSurfaceProps<T>;
  actions: ReactNode;
  presentation: "default" | "compact";
}

export function AntdSelectorSurface<T>({ selector, actions, presentation }: AntdSelectorSurfaceProps<T>) {
  return selector.kind === "tree"
    ? <AntdSelectorTree selector={selector} actions={actions} presentation={presentation} />
    : <AntdSelectorList selector={selector} actions={actions} presentation={presentation} />;
}
