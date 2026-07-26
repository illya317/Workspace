import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!process.env.WORKSPACE_CONFIG_DIR) {
  try {
    process.loadEnvFile(path.join(repoRoot, ".env"));
  } catch {
    // CI and production normally inject the path directly.
  }
}

function requiredWorkspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path for Agent workforce provisioning");
  }
  return fs.realpathSync(configured);
}

function readWorkspaceJson(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Agent workforce config path escapes WORKSPACE_CONFIG_DIR: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

const configRoot = requiredWorkspaceConfigDir();
const profile = readWorkspaceJson(configRoot, "config/tenant/profile.json");
const workforceConfig = readWorkspaceJson(configRoot, profile.files.agentWorkforce);

export const LOCK_NAME = workforceConfig.lockName;
export const DEPARTMENT = profile.agent.department;
export const PARENT_POSITION = profile.agent.parentPosition;
export const AGENT_RESOURCE_KEY = "agent.assistant";
export const MANAGED_WORKSPACE_RESOURCE_GRANTS = workforceConfig.managedWorkspaceResourceGrants;
export const VIRTUAL_PERSONNEL_TYPE = profile.hr.options.virtualEmployeePersonnelType;
export const PROVISIONER_LEDGER_SOURCE = workforceConfig.provisionerLedgerSource;
export const AGENT_BUSINESS_TIME_ZONE = profile.localization.businessTimeZone;
export const WORKFORCE = workforceConfig.workforce;

const agentBusinessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: AGENT_BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function agentBusinessDate(value) {
  const parts = agentBusinessDateFormatter.formatToParts(value);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function isAgentDateTimeEndActive(endDate, today) {
  if (!endDate) return true;
  const value = endDate instanceof Date ? endDate : new Date(endDate);
  return !Number.isNaN(value.getTime()) && agentBusinessDate(value) >= today;
}

export function isProvisionerCreatedGrantLedgerEvent(event) {
  return event?.source === PROVISIONER_LEDGER_SOURCE
    && event.eventType === "grant"
    && event.afterValue === true;
}
