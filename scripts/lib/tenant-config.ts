import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import type { TenantFinanceImportConfig, TenantProfile } from "../../packages/platform/tenant-config";

function workspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for tenant tooling");
  }
  return fs.realpathSync(configured);
}

function readWorkspaceJson<T>(root: string, relativePath: string): T {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Tenant tooling path escapes WORKSPACE_CONFIG_DIR: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8")) as T;
}

export function loadTenantProfile(): TenantProfile {
  const root = workspaceConfigDir();
  return readWorkspaceJson<TenantProfile>(root, "config/tenant/profile.json");
}

export function loadTenantFinanceImports(): TenantFinanceImportConfig {
  const root = workspaceConfigDir();
  const profile = readWorkspaceJson<TenantProfile>(root, "config/tenant/profile.json");
  return readWorkspaceJson<TenantFinanceImportConfig>(root, profile.files.financeImports);
}
