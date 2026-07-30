#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createRestartLease,
  DEFAULT_LEASE_DURATION_MS,
  extendRestartLease,
  parseDuration,
  readLocalDevStatus,
  readRestartLeases,
  releaseRestartLease,
} from "./local-dev-guard.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function durationFrom(value) {
  return value ? parseDuration(value) : DEFAULT_LEASE_DURATION_MS;
}

async function pause(args) {
  const positionalDuration = args[0]?.startsWith("-") ? null : args[0];
  const lease = await createRestartLease(repositoryRoot, {
    durationMs: durationFrom(positionalDuration),
    reason: readOption(args, "--reason") ?? "agent operation",
  });
  console.log(`lease_id=${lease.id}`);
  console.log(`expires_at=${lease.expiresAt}`);
}

async function resume(args) {
  const leaseId = args[0];
  if (!leaseId) throw new Error("Usage: npm run dev:guard -- resume <lease-id>");
  if (!(await releaseRestartLease(repositoryRoot, leaseId))) throw new Error(`Unknown or expired lease: ${leaseId}`);
  console.log(`released=${leaseId}`);
}

async function extend(args) {
  const [leaseId, duration = "30m"] = args;
  if (!leaseId) throw new Error("Usage: npm run dev:guard -- extend <lease-id> [duration]");
  const lease = await extendRestartLease(repositoryRoot, leaseId, parseDuration(duration));
  if (!lease) throw new Error(`Unknown or expired lease: ${leaseId}`);
  console.log(`lease_id=${lease.id}`);
  console.log(`expires_at=${lease.expiresAt}`);
}

async function status(args) {
  const [snapshot, leases] = await Promise.all([
    readLocalDevStatus(repositoryRoot),
    readRestartLeases(repositoryRoot),
  ]);
  let state = snapshot?.state ?? "not_running";
  if (snapshot?.supervisorPid && !["stopped", "exited"].includes(state)) {
    try {
      process.kill(snapshot.supervisorPid, 0);
    } catch {
      state = "stale";
    }
  }
  const effectiveSnapshot = snapshot ? { ...snapshot, state } : null;
  if (args.includes("--json")) {
    console.log(JSON.stringify({ status: effectiveSnapshot, activeLeases: leases }, null, 2));
    return;
  }

  console.log(`state=${state}`);
  console.log(`generation=${snapshot?.generation ?? "unknown"}`);
  console.log(`server_pid=${snapshot?.serverPid ?? "unknown"}`);
  console.log(`footprint_mib=${snapshot?.sample?.footprintBytes ? Math.round(snapshot.sample.footprintBytes / 1024 ** 2) : "unknown"}`);
  console.log(`hard_threshold_mib=${snapshot?.thresholds?.hardBytes ? Math.round(snapshot.thresholds.hardBytes / 1024 ** 2) : "unknown"}`);
  console.log(`active_leases=${leases.length}`);
  for (const lease of leases) console.log(`lease=${lease.id} expires_at=${lease.expiresAt} reason=${lease.reason}`);
}

export async function main(args = process.argv.slice(2)) {
  const [command = "status", ...rest] = args;
  if (command === "pause") return pause(rest);
  if (command === "resume") return resume(rest);
  if (command === "extend") return extend(rest);
  if (command === "status") return status(rest);
  throw new Error("Usage: npm run dev:guard -- <pause|resume|extend|status>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
