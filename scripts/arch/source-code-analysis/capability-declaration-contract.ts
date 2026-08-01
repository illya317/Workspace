import type { SourceModuleKind } from "./module-health-policy";

export const CAPABILITY_GOVERNED_MODULE_KEYS = [
  "platform",
  "finance",
  "work",
  "hr",
  "core",
  "data-model",
  "operations",
  "tooling",
] as const;

export type CapabilityGovernedModuleKey = (typeof CAPABILITY_GOVERNED_MODULE_KEYS)[number];

export interface SourceCapabilityPathRule {
  kind: "directChildren" | "file" | "prefix";
  path: string;
}

export interface SourceCapabilityPathOptions {
  directChildren?: readonly string[];
  files?: readonly string[];
  prefixes?: readonly string[];
  rootDirectChildren?: readonly string[];
  rootFiles?: readonly string[];
  rootPrefixes?: readonly string[];
}

export interface SourceCapabilityOptions extends SourceCapabilityPathOptions {
  parentKey?: string | null;
  kind?: SourceModuleKind;
  interfaceFiles?: readonly string[];
  interfacePrefixes?: readonly string[];
}

export interface SourceCapabilityDeclaration {
  moduleKey: CapabilityGovernedModuleKey;
  key: string;
  kind: SourceModuleKind;
  /** Null means the product L1 is the parent. Otherwise this points at another node in the same tree. */
  parentKey: string | null;
  label: string;
  include: readonly SourceCapabilityPathRule[];
  /** Explicit public Interface paths that other branches may import. */
  interface: readonly SourceCapabilityPathRule[];
}

export type SourceCapabilityFactory = (
  moduleKey: CapabilityGovernedModuleKey,
  key: string,
  label: string,
  options: SourceCapabilityOptions,
) => SourceCapabilityDeclaration;
