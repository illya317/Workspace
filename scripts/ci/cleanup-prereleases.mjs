#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const TAG_PATTERN = /^ci-artifact-[0-9a-f]{40}-run-[1-9][0-9]*-attempt-[1-9][0-9]*$/;
const ACTIVE_DEPLOYMENT_STATES = new Set(["pending", "queued", "in_progress"]);
const ACTIVE_DEPLOYMENT_TTL_MS = 6 * 60 * 60 * 1000;

function releaseTime(release) {
  const raw = release.published_at || release.created_at;
  const value = Date.parse(raw || "");
  if (!Number.isFinite(value)) throw new Error(`release ${release.id} has no valid timestamp`);
  return value;
}

export function selectReleasesToDelete({
  releases,
  keep = 10,
  protectedTags = new Set(),
  now = Date.now(),
  minimumAgeMs = 24 * 60 * 60 * 1000,
}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error("keep must be a positive integer");
  const candidates = releases
    .filter((release) => release.prerelease === true && TAG_PATTERN.test(release.tag_name || ""))
    .sort((left, right) => releaseTime(right) - releaseTime(left));
  const retainedByCount = new Set(candidates.slice(0, keep).map((release) => release.tag_name));
  return candidates.filter((release) => (
    !retainedByCount.has(release.tag_name)
    && !protectedTags.has(release.tag_name)
    && now - releaseTime(release) >= minimumAgeMs
  ));
}

function apiClient({ repository, token, apiUrl = "https://api.github.com" }) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function request(endpoint, options = {}) {
    const response = await fetch(`${apiUrl}/repos/${repository}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${options.method || "GET"} ${endpoint} failed (${response.status}): ${body}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  async function pages(endpoint) {
    const values = [];
    for (let page = 1; ; page += 1) {
      const separator = endpoint.includes("?") ? "&" : "?";
      const result = await request(`${endpoint}${separator}per_page=100&page=${page}`);
      if (!Array.isArray(result)) throw new Error(`GitHub API ${endpoint} must return an array`);
      values.push(...result);
      if (result.length < 100) return values;
    }
  }
  return { request, pages };
}

export function activeDeploymentIsFresh(deployment, now = Date.now()) {
  if (!deployment.created_at) return true;
  const createdAt = Date.parse(deployment.created_at);
  return Number.isFinite(createdAt) && now - createdAt <= ACTIVE_DEPLOYMENT_TTL_MS;
}

export async function deploymentTagsToProtect(client, { now = Date.now() } = {}) {
  const protectedTags = new Set();
  const deployments = (await client.pages("/deployments?environment=production"))
    .filter((deployment) => /^[0-9a-f]{40}$/.test(deployment.sha || ""))
    .sort((left, right) => Number(right.id) - Number(left.id));
  const records = await Promise.all(deployments.map(async (deployment) => {
    const statuses = await client.request(`/deployments/${deployment.id}/statuses?per_page=1`);
    if (!Array.isArray(statuses)) throw new Error(`deployment ${deployment.id} statuses must be an array`);
    return { deployment, state: statuses[0]?.state ?? null };
  }));
  let currentSuccessProtected = false;
  for (const { deployment, state } of records) {
    const runId = Number(deployment.payload?.githubRunId);
    const runAttempt = Number(deployment.payload?.githubRunAttempt);
    const tag = Number.isInteger(runId) && runId > 0 && Number.isInteger(runAttempt) && runAttempt > 0
      ? `ci-artifact-${deployment.sha}-run-${runId}-attempt-${runAttempt}`
      : null;
    if ((state === null || ACTIVE_DEPLOYMENT_STATES.has(state)) && tag && activeDeploymentIsFresh(deployment, now)) {
      protectedTags.add(tag);
    } else if (state === "success" && !currentSuccessProtected && tag) {
      protectedTags.add(tag);
      currentSuccessProtected = true;
    }
  }
  return protectedTags;
}

function parseArguments(argv) {
  const options = {
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    keep: 10,
    minimumAgeHours: 24,
    apply: false,
    protectedTags: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repository") options.repository = argv[++index];
    else if (argument === "--keep") options.keep = Number(argv[++index]);
    else if (argument === "--minimum-age-hours") options.minimumAgeHours = Number(argv[++index]);
    else if (argument === "--protect-tag") options.protectedTags.push(argv[++index]);
    else if (argument === "--apply") options.apply = true;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!/^[^/]+\/[^/]+$/.test(options.repository || "")) throw new Error("--repository owner/name is required");
  if (!options.token) throw new Error("GITHUB_TOKEN or GH_TOKEN is required");
  if (!Number.isInteger(options.keep) || options.keep < 1) throw new Error("--keep must be a positive integer");
  if (!Number.isFinite(options.minimumAgeHours) || options.minimumAgeHours < 1) {
    throw new Error("--minimum-age-hours must be at least 1");
  }
  for (const tag of options.protectedTags) {
    if (!TAG_PATTERN.test(tag)) throw new Error(`invalid protected tag: ${tag}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const client = apiClient(options);
  const protectedTags = new Set(options.protectedTags);
  for (const tag of await deploymentTagsToProtect(client)) protectedTags.add(tag);
  const releases = await client.pages("/releases");
  const selected = selectReleasesToDelete({
    releases,
    keep: options.keep,
    protectedTags,
    minimumAgeMs: options.minimumAgeHours * 60 * 60 * 1000,
  });
  for (const release of selected) {
    process.stdout.write(`${options.apply ? "delete" : "would delete"} ${release.tag_name} (release ${release.id})\n`);
    if (!options.apply) continue;
    const currentProtectedTags = await deploymentTagsToProtect(client);
    if (currentProtectedTags.has(release.tag_name)) {
      process.stdout.write(`skip ${release.tag_name}: deployment started after retention snapshot\n`);
      continue;
    }
    await client.request(`/releases/${release.id}`, { method: "DELETE" });
    await client.request(`/git/refs/tags/${encodeURIComponent(release.tag_name)}`, { method: "DELETE" });
  }
  process.stdout.write(`Retained newest ${options.keep}, ${protectedTags.size} protected, selected ${selected.length}.\n`);
  return selected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
