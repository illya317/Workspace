"use client";

import { AntdBodySurface } from "./internal/body/antd-body";
import { assertNoSurfaceExplanatoryText } from "./internal/body/BodySurfaceGuardParts";
import type { BodySurfaceProps } from "./BodySurface.types";

export type * from "./BodySurface.types";

/** BodySurface owns declaration validation; AntdBodySurface is its sole general renderer. */
export default function BodySurface(props: BodySurfaceProps) {
  assertNoSurfaceExplanatoryText(props);
  return <AntdBodySurface body={props} />;
}
