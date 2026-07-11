import "server-only";
import path from "path";

export function qcRuntimeDataPath(fileName: string) {
  const workspaceDir = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!workspaceDir) {
    throw new Error("WORKSPACE_CONFIG_DIR is required for QC runtime data storage");
  }
  if (!path.isAbsolute(workspaceDir)) {
    throw new Error(`WORKSPACE_CONFIG_DIR must be absolute: ${workspaceDir}`);
  }
  return path.join(workspaceDir, "data", fileName);
}
