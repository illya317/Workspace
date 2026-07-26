import type { MobileExperienceStrategy, SubModuleRegistration } from "@workspace/core";
import { activeModuleDefinitions } from "./effective-module-registry";

export const mobileExperienceEntries: SubModuleRegistration[] = activeModuleDefinitions
  .flatMap((definition) => definition.moduleDef?.children ?? []);

export interface ResolvedMobileExperience {
  strategy: MobileExperienceStrategy;
  label?: string;
  reason?: string;
}

export function resolveMobileExperience(pathname: string): ResolvedMobileExperience {
  const child = mobileExperienceEntries
    .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
  if (!child) return { strategy: "native" };
  const override = child.mobileExperience.overrides
    ?.filter((item) => pathname === item.pathPrefix || pathname.startsWith(`${item.pathPrefix}/`))
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)[0];
  return {
    strategy: override?.strategy ?? child.mobileExperience.strategy,
    label: child.label,
    reason: override?.reason ?? child.mobileExperience.reason,
  };
}
