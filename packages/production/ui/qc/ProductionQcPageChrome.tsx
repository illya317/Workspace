import type { SessionUser } from "@workspace/platform/types";
import type { ReactNode } from "react";

export interface ProductionQcPageChromeSpec {
  title: ReactNode;
  backHref: string;
  user: SessionUser;
}

export function productionQcPageKind(_spec: ProductionQcPageChromeSpec): "standard" {
  return "standard";
}
