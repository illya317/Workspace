import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

type DeploySlot = "blue" | "green";

type GatewayPaths = {
  root: string;
  currentDirectory: string;
  currentStateFile: string;
  committedGenerationFile: string;
};

export type ProjectNotificationSchedulerRuntime =
  | { mode: "monolith"; gateway: GatewayPaths | null }
  | { mode: "deploy-unit"; slot: DeploySlot; gateway: GatewayPaths }
  | {
    mode: "invalid";
    reason:
      | "invalid_deploy_unit"
      | "invalid_deploy_slot"
      | "invalid_current_state_file"
      | "invalid_workspace_config";
  };

export type ProjectNotificationSchedulerGate = {
  active: boolean;
  reason:
    | "monolith_no_gateway"
    | "monolith_no_work_unit"
    | "monolith_yields_to_work_unit"
    | "active_slot"
    | "inactive_slot"
    | "invalid_configuration"
    | "gateway_transition"
    | "state_unavailable"
    | "state_invalid";
};

type WorkStateResult =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "valid"; slot: DeploySlot };

type GatewaySnapshot =
  | { kind: "missing" }
  | { kind: "transition" }
  | { kind: "state"; committed: boolean; workState: WorkStateResult };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deploySlot(value: string): DeploySlot | null {
  return value === "blue" || value === "green" ? value : null;
}

function gatewayPaths(root: string): GatewayPaths {
  const currentDirectory = path.join(root, "gateway", "current");
  return {
    root: path.join(root, "gateway"),
    currentDirectory,
    currentStateFile: path.join(currentDirectory, "unit-states", "work.json"),
    committedGenerationFile: path.join(root, "gateway", "committed-generation"),
  };
}

function gatewayPathsFromStateFile(currentStateFile: string): GatewayPaths | null {
  if (!path.isAbsolute(currentStateFile) || path.basename(currentStateFile) !== "work.json") return null;
  const unitStatesDirectory = path.dirname(currentStateFile);
  const currentDirectory = path.dirname(unitStatesDirectory);
  if (path.basename(unitStatesDirectory) !== "unit-states" || path.basename(currentDirectory) !== "current") return null;
  const root = path.dirname(currentDirectory);
  return {
    root,
    currentDirectory,
    currentStateFile,
    committedGenerationFile: path.join(root, "committed-generation"),
  };
}

function missingFile(error: unknown) {
  return isRecord(error) && error.code === "ENOENT";
}

export function resolveProjectNotificationSchedulerRuntime(
  environment: NodeJS.ProcessEnv = process.env,
): ProjectNotificationSchedulerRuntime {
  const unitId = environment.WORKSPACE_DEPLOY_UNIT_ID?.trim() ?? "";
  const rawSlot = environment.WORKSPACE_DEPLOY_SLOT?.trim() ?? "";
  const currentStateFile = environment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE?.trim() ?? "";
  const workspaceConfig = environment.WORKSPACE_CONFIG_DIR?.trim() ?? "";
  if (!unitId && !rawSlot && !currentStateFile) {
    if (!workspaceConfig) return { mode: "monolith", gateway: null };
    if (!path.isAbsolute(workspaceConfig)) {
      return { mode: "invalid", reason: "invalid_workspace_config" };
    }
    return { mode: "monolith", gateway: gatewayPaths(workspaceConfig) };
  }
  if (unitId !== "work") return { mode: "invalid", reason: "invalid_deploy_unit" };
  const slot = deploySlot(rawSlot);
  if (!slot) return { mode: "invalid", reason: "invalid_deploy_slot" };
  const gateway = gatewayPathsFromStateFile(currentStateFile);
  if (!gateway) return { mode: "invalid", reason: "invalid_current_state_file" };
  return { mode: "deploy-unit", slot, gateway };
}

async function readWorkState(generationDirectory: string): Promise<WorkStateResult> {
  let source: string;
  try {
    source = await readFile(path.join(generationDirectory, "unit-states", "work.json"), "utf8");
  } catch (error) {
    return missingFile(error) ? { kind: "missing" } : { kind: "invalid" };
  }
  let state: unknown;
  try {
    state = JSON.parse(source);
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(state)
    || state.schemaVersion !== 1
    || state.kind !== "workspace-deploy-unit-state"
    || state.unitId !== "work"
    || !isRecord(state.active)
    || state.active.unitId !== "work") {
    return { kind: "invalid" };
  }
  const slot = deploySlot(String(state.active.slot ?? ""));
  return slot ? { kind: "valid", slot } : { kind: "invalid" };
}

async function readCommittedGeneration(paths: GatewayPaths) {
  try {
    return (await readFile(paths.committedGenerationFile, "utf8")).trim();
  } catch (error) {
    if (missingFile(error)) return null;
    throw error;
  }
}

async function resolveCurrentGeneration(paths: GatewayPaths) {
  try {
    const directory = await realpath(paths.currentDirectory);
    const generationsDirectory = await realpath(path.join(paths.root, "generations"));
    const generationId = path.basename(directory);
    if (path.dirname(directory) !== generationsDirectory || !/^[0-9a-f]{64}$/.test(generationId)) return null;
    return { directory, generationId };
  } catch (error) {
    if (missingFile(error)) return null;
    throw error;
  }
}

async function readGatewaySnapshot(paths: GatewayPaths): Promise<GatewaySnapshot> {
  const before = await resolveCurrentGeneration(paths);
  if (!before) return { kind: "missing" };
  const committedBefore = await readCommittedGeneration(paths);
  const workState = await readWorkState(before.directory);
  if (committedBefore === null) return { kind: "state", committed: false, workState };
  if (committedBefore !== before.generationId) return { kind: "transition" };

  const after = await resolveCurrentGeneration(paths);
  const committedAfter = await readCommittedGeneration(paths);
  if (!after
    || after.generationId !== before.generationId
    || committedAfter !== before.generationId) {
    return { kind: "transition" };
  }
  return { kind: "state", committed: true, workState };
}

export async function evaluateProjectNotificationSchedulerGate(
  runtime: ProjectNotificationSchedulerRuntime,
): Promise<ProjectNotificationSchedulerGate> {
  if (runtime.mode === "invalid") return { active: false, reason: "invalid_configuration" };
  if (runtime.gateway === null) {
    return { active: true, reason: "monolith_no_gateway" };
  }

  const snapshot = await readGatewaySnapshot(runtime.gateway);
  if (snapshot.kind === "missing") {
    return runtime.mode === "monolith"
      ? { active: true, reason: "monolith_no_gateway" }
      : { active: false, reason: "state_unavailable" };
  }
  if (snapshot.kind === "transition") return { active: false, reason: "gateway_transition" };
  if (snapshot.workState.kind === "invalid") return { active: false, reason: "state_invalid" };
  if (runtime.mode === "monolith") {
    return snapshot.workState.kind === "missing"
      ? { active: true, reason: "monolith_no_work_unit" }
      : { active: false, reason: "monolith_yields_to_work_unit" };
  }
  if (!snapshot.committed || snapshot.workState.kind === "missing") {
    return { active: false, reason: "state_unavailable" };
  }
  return snapshot.workState.slot === runtime.slot
    ? { active: true, reason: "active_slot" }
    : { active: false, reason: "inactive_slot" };
}
