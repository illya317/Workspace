/**
 * Runtime-safe projection of the canonical deploy graph.
 *
 * The deploy tooling owns the graph. A deploy gate compares this projection
 * with `scripts/deploy/deploy-unit-spec.ts` so Settings can read topology
 * without importing build tooling into the production runtime.
 */

export type DeployUnitCatalogKind = "business-l1" | "headless-runtime" | "platform-l1" | "workspace-shell";
export type DeployUnitCatalogMaturity = "active" | "candidate" | "planned";

export interface DeployUnitCatalogDependency {
  unitId: string;
  requirement: "required" | "optional";
  protocol: "gateway-http" | "signed-internal-rpc";
  reason: string;
}

export interface DeployUnitCatalogEntry {
  id: string;
  kind: DeployUnitCatalogKind;
  maturity: DeployUnitCatalogMaturity;
  registryPackages: readonly string[];
  runtimeDependencies: readonly DeployUnitCatalogDependency[];
}

export const DEPLOY_UNIT_CATALOG: readonly DeployUnitCatalogEntry[] = [
  {
    id: "workspace-shell",
    kind: "workspace-shell",
    maturity: "active",
    registryPackages: ["@workspace/settings", "@workspace/platform:system"],
    runtimeDependencies: [
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "data quality provider" },
      { unitId: "work", requirement: "required", protocol: "signed-internal-rpc", reason: "account notifications and preferred projects" },
    ],
  },
  {
    id: "finance",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/finance"],
    runtimeDependencies: [
      { unitId: "administration", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
      { unitId: "capital-securities", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "external", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "inventory", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis sources and read-only period closing inspections" },
      { unitId: "library", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "production", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "work", requirement: "required", protocol: "signed-internal-rpc", reason: "business-space access policy" },
    ],
  },
  { id: "external", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/external"], runtimeDependencies: [] },
  { id: "inventory", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/inventory"], runtimeDependencies: [] },
  { id: "production", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/production"], runtimeDependencies: [] },
  {
    id: "hr",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/hr"],
    runtimeDependencies: [
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
    ],
  },
  {
    id: "library",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/library"],
    runtimeDependencies: [
      { unitId: "administration", requirement: "required", protocol: "signed-internal-rpc", reason: "current contract ledger snapshots" },
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "library agent tools" },
      { unitId: "capital-securities", requirement: "required", protocol: "signed-internal-rpc", reason: "current ownership structure snapshots" },
      { unitId: "docs", requirement: "optional", protocol: "gateway-http", reason: "document editing integration" },
      { unitId: "finance", requirement: "required", protocol: "signed-internal-rpc", reason: "verified standalone and consolidated financial statement snapshots" },
      { unitId: "hr", requirement: "required", protocol: "signed-internal-rpc", reason: "organization chart and due-diligence roster snapshots" },
    ],
  },
  {
    id: "docs",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/docs"],
    runtimeDependencies: [
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
    ],
  },
  {
    id: "assistant",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/agent"],
    runtimeDependencies: [
      { unitId: "finance", requirement: "optional", protocol: "signed-internal-rpc", reason: "Finance agent domain" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "HR agent domain" },
      { unitId: "library", requirement: "optional", protocol: "signed-internal-rpc", reason: "Library and WeCom agent domain" },
      { unitId: "work", requirement: "optional", protocol: "signed-internal-rpc", reason: "Work agent domain" },
    ],
  },
  { id: "capital-securities", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/capital-securities"], runtimeDependencies: [] },
  {
    id: "work",
    kind: "business-l1",
    maturity: "active",
    registryPackages: ["@workspace/work"],
    runtimeDependencies: [
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
      { unitId: "finance", requirement: "required", protocol: "gateway-http", reason: "operational analysis zone" },
      { unitId: "hr", requirement: "required", protocol: "gateway-http", reason: "employee performance zone" },
    ],
  },
  { id: "administration", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/administration"], runtimeDependencies: [] },
  { id: "news", kind: "business-l1", maturity: "active", registryPackages: ["@workspace/news"], runtimeDependencies: [] },
] as const;
