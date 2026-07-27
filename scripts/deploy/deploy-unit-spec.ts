export const DEPLOY_GRAPH_SCHEMA_VERSION = 1 as const;

export type DeployUnitKind =
  | "business-l1"
  | "headless-runtime"
  | "platform-l1"
  | "workspace-shell";

export type DeployUnitMaturity = "active" | "candidate" | "planned";
export type DeployUnitCoordination = "available" | "frozen-final-handoff";
export type DeployUnitSlot = "blue" | "green";

export interface DeployUnitSlotSpec {
  port: number;
}

export interface DeployUnitRuntimeDependency {
  unitId: string;
  requirement: "required" | "optional";
  protocol: "gateway-http" | "signed-internal-rpc";
  reason: string;
}

export interface DeployUnitSloSpec {
  availabilityPercent: number;
  p95LatencyMs: number;
  maximumErrorRatePercent: number;
  canaryObservationMinutes: number;
  recoveryTimeObjectiveMinutes: number;
  recoveryPointObjectiveMinutes: number;
}

export interface DeployUnitRuntimeSpec {
  engine: "next-standalone" | "node-worker";
  appRoot: string;
  processName: string;
  slots: Record<DeployUnitSlot, DeployUnitSlotSpec>;
  assetPrefix: string | null;
  healthPath: "/api/internal/health";
  versionPath: "/api/settings/version";
  capacity: {
    memoryMiB: number | null;
    databasePoolMax: number | null;
    blueGreenReplicaMultiplier: 2;
  };
  slo: DeployUnitSloSpec;
}

/**
 * Runtime-only facts that cannot be derived from the product registry,
 * TypeScript references, or the E2E impact map.
 *
 * Page routes, API prefixes, package scopes, compiler closure, source roots,
 * and cross-L1 contributors intentionally do not live here.
 */
export interface DeployUnitBlueprint {
  id: string;
  kind: DeployUnitKind;
  maturity: DeployUnitMaturity;
  coordination: DeployUnitCoordination;
  registryPackages: readonly string[];
  impactModules: readonly string[];
  runtimeDependencies: readonly DeployUnitRuntimeDependency[];
  runtime: DeployUnitRuntimeSpec;
}

const HEALTH_PATH = "/api/internal/health" as const;
const VERSION_PATH = "/api/settings/version" as const;

function nextZone(
  id: string,
  bluePort: number,
  registryPackage: string,
  options: {
    capacity?: { databasePoolMax: number; memoryMiB: number };
    coordination?: DeployUnitCoordination;
    impactModule?: string;
    kind?: "business-l1" | "platform-l1";
    maturity?: DeployUnitMaturity;
    runtimeDependencies?: readonly DeployUnitRuntimeDependency[];
  } = {},
): DeployUnitBlueprint {
  return {
    id,
    kind: options.kind ?? "business-l1",
    maturity: options.maturity ?? "planned",
    coordination: options.coordination ?? "available",
    registryPackages: [registryPackage],
    impactModules: [options.impactModule ?? id],
    runtimeDependencies: options.runtimeDependencies ?? [],
    runtime: {
      engine: "next-standalone",
      appRoot: `apps/${id}`,
      processName: `workspace-${id}`,
      slots: {
        blue: { port: bluePort },
        green: { port: bluePort + 100 },
      },
      assetPrefix: `/workspace-static/${id}`,
      healthPath: HEALTH_PATH,
      versionPath: VERSION_PATH,
      capacity: {
        memoryMiB: options.capacity?.memoryMiB ?? null,
        databasePoolMax: options.capacity?.databasePoolMax ?? null,
        blueGreenReplicaMultiplier: 2,
      },
      slo: {
        availabilityPercent: 99.9,
        p95LatencyMs: 1500,
        maximumErrorRatePercent: 1,
        canaryObservationMinutes: 15,
        recoveryTimeObjectiveMinutes: 30,
        recoveryPointObjectiveMinutes: 5,
      },
    },
  };
}

export const deployUnitBlueprints: readonly DeployUnitBlueprint[] = [
  {
    id: "workspace-shell",
    kind: "workspace-shell",
    maturity: "active",
    coordination: "available",
    registryPackages: ["@workspace/platform:settings", "@workspace/platform:system"],
    impactModules: ["shell", "settings", "auth"],
    runtimeDependencies: [
      { unitId: "work", requirement: "required", protocol: "signed-internal-rpc", reason: "account notifications and preferred projects" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "data quality provider" },
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
    ],
    runtime: {
      engine: "next-standalone",
      appRoot: "apps/workspace-shell",
      processName: "workspace-shell",
      slots: {
        blue: { port: 3200 },
        green: { port: 3300 },
      },
      assetPrefix: null,
      healthPath: HEALTH_PATH,
      versionPath: VERSION_PATH,
      capacity: {
        memoryMiB: 768,
        databasePoolMax: 4,
        blueGreenReplicaMultiplier: 2,
      },
      slo: {
        availabilityPercent: 99.95,
        p95LatencyMs: 750,
        maximumErrorRatePercent: 0.5,
        canaryObservationMinutes: 15,
        recoveryTimeObjectiveMinutes: 15,
        recoveryPointObjectiveMinutes: 5,
      },
    },
  },
  nextZone("finance", 3201, "@workspace/finance", {
    maturity: "active",
    capacity: { memoryMiB: 768, databasePoolMax: 4 },
    runtimeDependencies: [
      { unitId: "work", requirement: "required", protocol: "signed-internal-rpc", reason: "business-space access policy" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "inventory", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "library", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "production", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "external", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "administration", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "capital-securities", requirement: "optional", protocol: "signed-internal-rpc", reason: "authorized workspace analysis source discovery and execution" },
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
    ],
  }),
  nextZone("external", 3202, "@workspace/external", { maturity: "active", capacity: { memoryMiB: 512, databasePoolMax: 3 } }),
  nextZone("inventory", 3203, "@workspace/inventory", { maturity: "active", capacity: { memoryMiB: 768, databasePoolMax: 4 } }),
  nextZone("production", 3204, "@workspace/production", { maturity: "active", capacity: { memoryMiB: 768, databasePoolMax: 4 } }),
  nextZone("hr", 3205, "@workspace/hr", { maturity: "active", capacity: { memoryMiB: 768, databasePoolMax: 4 }, runtimeDependencies: [
    { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
  ] }),
  nextZone("library", 3206, "@workspace/library", { maturity: "active", capacity: { memoryMiB: 768, databasePoolMax: 3 }, runtimeDependencies: [
    { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "library agent tools" },
    { unitId: "docs", requirement: "optional", protocol: "gateway-http", reason: "document editing integration" },
    { unitId: "finance", requirement: "required", protocol: "signed-internal-rpc", reason: "verified standalone and consolidated financial statement snapshots" },
    { unitId: "hr", requirement: "required", protocol: "signed-internal-rpc", reason: "organization chart and due-diligence roster snapshots" },
    { unitId: "capital-securities", requirement: "required", protocol: "signed-internal-rpc", reason: "current ownership structure snapshots" },
    { unitId: "administration", requirement: "required", protocol: "signed-internal-rpc", reason: "current contract ledger snapshots" },
  ] }),
  nextZone("docs", 3207, "@workspace/platform:docs", { kind: "platform-l1", maturity: "active", capacity: { memoryMiB: 512, databasePoolMax: 3 }, runtimeDependencies: [
    { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
  ] }),
  {
    id: "assistant",
    kind: "headless-runtime",
    maturity: "active",
    coordination: "available",
    registryPackages: ["@workspace/platform:agent"],
    impactModules: ["agent", "integrations"],
    runtimeDependencies: [
      { unitId: "finance", requirement: "optional", protocol: "signed-internal-rpc", reason: "Finance agent domain" },
      { unitId: "hr", requirement: "optional", protocol: "signed-internal-rpc", reason: "HR agent domain" },
      { unitId: "library", requirement: "optional", protocol: "signed-internal-rpc", reason: "Library and WeCom agent domain" },
      { unitId: "work", requirement: "optional", protocol: "signed-internal-rpc", reason: "Work agent domain" },
    ],
    runtime: {
      engine: "next-standalone",
      appRoot: "apps/assistant",
      processName: "workspace-assistant",
      slots: {
        blue: { port: 3208 },
        green: { port: 3308 },
      },
      assetPrefix: null,
      healthPath: HEALTH_PATH,
      versionPath: VERSION_PATH,
      capacity: {
        memoryMiB: 1024,
        databasePoolMax: 4,
        blueGreenReplicaMultiplier: 2,
      },
      slo: {
        availabilityPercent: 99.5,
        p95LatencyMs: 3000,
        maximumErrorRatePercent: 2,
        canaryObservationMinutes: 20,
        recoveryTimeObjectiveMinutes: 30,
        recoveryPointObjectiveMinutes: 5,
      },
    },
  },
  nextZone("capital-securities", 3209, "@workspace/capital-securities", {
    maturity: "active",
    capacity: { memoryMiB: 768, databasePoolMax: 4 },
    impactModule: "capital-securities",
  }),
  nextZone("work", 3210, "@workspace/work", {
    maturity: "active",
    capacity: { memoryMiB: 1024, databasePoolMax: 6 },
    runtimeDependencies: [
      { unitId: "finance", requirement: "required", protocol: "gateway-http", reason: "operational analysis zone" },
      { unitId: "hr", requirement: "required", protocol: "gateway-http", reason: "employee performance zone" },
      { unitId: "assistant", requirement: "optional", protocol: "gateway-http", reason: "page assistant" },
    ],
  }),
  nextZone("administration", 3211, "@workspace/administration", {
    maturity: "active",
    capacity: { memoryMiB: 512, databasePoolMax: 3 },
  }),
] as const;

export const deployGraphControlPlane = {
  lifecycleOwner: "workspace-control-plane-job",
  databaseMigrationMode: "central-expand-contract",
  migrationSetSource: "prisma/migrations",
  minimumSchemaReceipt: "required-before-unit-start",
  resourceSeedMode: "central",
  dataReleaseMode: "central-receipted",
  currentMonolithAppProject: "tsconfig.app.json",
  sharedChangeFanout: "all-deploy-units",
  privateChangeFanout: "owning-unit-and-runtime-contributors",
  connectionBudget: {
    maximumApplicationConnections: 100,
    reservedControlPlaneConnections: 20,
    minimumPostgresqlMaxConnections: 120,
  },
  gateway: {
    basePath: "/workspace",
    legacyFallback: {
      host: "127.0.0.1",
      port: 3000,
      processName: "workspace",
    },
    generationCommitPoint: "atomic-symlink-then-nginx-reload",
  },
} as const;
