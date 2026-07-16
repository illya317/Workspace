import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createBootstrapContext } from "../scripts/ci/production-bootstrap-receipt.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceCli = path.join(repositoryRoot, "ops", "release-evidence.mjs");
const sourceSha = "a".repeat(40);
const sourceTree = "b".repeat(40);
const checkAppId = 15368;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationSetDigest(root) {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  walk(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(path.relative(repositoryRoot, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function bootstrapGitFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "release-evidence-bootstrap-git-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.email", "ci@example.test");
  git("config", "user.name", "CI");
  mkdirSync(path.join(root, "prisma/migrations/20200101000000_init"), { recursive: true });
  writeFileSync(path.join(root, "prisma/migrations/20200101000000_init/migration.sql"), "CREATE TABLE example(id INT);\n");
  writeFileSync(path.join(root, ".cnb.yml"), "placeholder\n");
  git("add", ".");
  git("commit", "-qm", "baseline");
  const baseline = git("rev-parse", "HEAD");
  writeFileSync(path.join(root, ".cnb.yml"), "legacy\n");
  git("add", ".cnb.yml");
  git("commit", "-qm", "legacy injection");
  const legacy = git("rev-parse", "HEAD");
  git("checkout", "-qb", "candidate", baseline);
  writeFileSync(path.join(root, "README.md"), "candidate\n");
  git("add", "README.md");
  git("commit", "-qm", "candidate");
  const candidate = git("rev-parse", "HEAD");
  const tree = git("rev-parse", "HEAD^{tree}");
  return { root, baseline, legacy, candidate, tree };
}

function runNode(arguments_, options = {}) {
  return spawnSync(process.execPath, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

function createGithubFixture({
  latestFailure = false,
  newerEventFailure = false,
  newerScheduleFailure = false,
  weakProtection = false,
  weakCodeOwnerProtection = false,
  expiredArtifact = false,
  delayedNewRun = false,
  event = "push",
  dispatchFull = true,
  runAttempt = 1,
  fixtureSourceSha = sourceSha,
  fixtureSourceTree = sourceTree,
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "release-evidence-test-"));
  const bin = path.join(root, "bin");
  const download = path.join(root, "download");
  mkdirSync(bin);
  mkdirSync(download);

  const artifactName = "workspace-standalone.tgz";
  const manifestName = "workspace-standalone.manifest.json";
  const artifact = Buffer.from("trusted protected-main standalone artifact\n");
  const artifactSha = sha256(artifact);
  const forcedDispatch = event === "workflow_dispatch" && dispatchFull;
  const classification = {
    schemaVersion: 1,
    riskClass: forcedDispatch ? "C3" : "C2",
    e2eMode: forcedDispatch ? "full" : "targeted",
    requiredSuites: forcedDispatch ? [] : ["settings-save"],
    e2eSpecs: forcedDispatch ? [] : ["e2e/settings-save.spec.ts"],
  };
  const manifest = {
    schemaVersion: 1,
    source: { commitSha: fixtureSourceSha, treeSha: fixtureSourceTree },
    inputs: { packageLockSha256: "1".repeat(64), migrationSetSha256: "2".repeat(64) },
    artifact: { fileName: artifactName, sha256: artifactSha, sizeBytes: artifact.length },
    build: {
      buildId: fixtureSourceSha,
      packageVersion: "1.0.0",
      nextVersion: "16.0.0",
      githubRunId: "200",
      githubRunAttempt: String(runAttempt),
      githubEventName: event,
      riskClass: classification.riskClass,
      e2eMode: classification.e2eMode,
      forceFull: forcedDispatch,
      targetSha: fixtureSourceSha,
      requiredSuites: classification.requiredSuites,
      e2eSpecs: classification.e2eSpecs,
      classification,
    },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha = sha256(manifestBytes);
  const artifactPath = path.join(download, artifactName);
  const manifestPath = path.join(download, manifestName);
  writeFileSync(artifactPath, artifact);
  writeFileSync(manifestPath, manifestBytes);

  const releaseTag = `ci-artifact-${fixtureSourceSha}-run-200-attempt-${runAttempt}`;
  const data = {
    repository: "acme/workspace",
    sourceSha: fixtureSourceSha,
    sourceTree: fixtureSourceTree,
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    requiredJobName: "CI / required",
    actionsArtifactName: `workspace-standalone-${fixtureSourceSha}-run-200-attempt-${runAttempt}`,
    artifactName,
    manifestName,
    artifactPath,
    manifestPath,
    artifactSha,
    manifestSha,
    artifactSize: artifact.length,
    releaseTag,
    checkAppId,
    latestFailure,
    newerEventFailure,
    newerScheduleFailure,
    weakProtection,
    weakCodeOwnerProtection,
    expiredArtifact,
    delayedNewRun,
    runAttempt,
    runPollPath: path.join(root, "run-polls.txt"),
    event,
  };
  const dataPath = path.join(root, "data.json");
  writeFileSync(dataPath, `${JSON.stringify(data)}\n`);

  const ghPath = path.join(bin, "gh");
  writeFileSync(ghPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(process.env.MOCK_GITHUB_DATA, 'utf8'));
const args = process.argv.slice(2);
function output(value) { process.stdout.write(JSON.stringify(value)); }
if (args[0] === 'run' && args[1] === 'download') {
  const directory = args[args.indexOf('--dir') + 1];
  fs.copyFileSync(data.artifactPath, path.join(directory, data.artifactName));
  fs.copyFileSync(data.manifestPath, path.join(directory, data.manifestName));
  process.exit(0);
}
if (args[0] !== 'api') process.exit(91);
const endpoint = args[3];
if (endpoint === 'repos/acme/workspace/branches/main') {
  output({ protected: true, commit: { sha: data.sourceSha } });
} else if (endpoint === 'repos/acme/workspace/actions/runs') {
  const success = { id: 200, name: data.workflowName, path: data.workflowPath, event: data.event, head_branch: 'main', head_sha: data.sourceSha, status: 'completed', conclusion: 'success', run_attempt: data.runAttempt };
  let runs;
  if (data.delayedNewRun) {
    const polls = fs.existsSync(data.runPollPath) ? Number(fs.readFileSync(data.runPollPath, 'utf8')) : 0;
    fs.writeFileSync(data.runPollPath, String(polls + 1));
    const old = { ...success, id: 199 };
    runs = polls === 0 ? [old] : [success, old];
  } else {
    runs = data.latestFailure
      ? [{ ...success, id: 201, conclusion: 'failure' }, success]
      : data.newerScheduleFailure
        ? [{ ...success, id: 201, event: 'schedule', conclusion: 'failure' }, success]
        : data.newerEventFailure
        ? [{ ...success, id: 201, event: data.event === 'push' ? 'workflow_dispatch' : 'push', conclusion: 'failure' }, success]
        : [success];
  }
  output({ workflow_runs: runs });
} else if (endpoint === 'repos/acme/workspace/actions/runs/200/jobs') {
  output({ jobs: [{ id: 300, name: data.requiredJobName, status: 'completed', conclusion: 'success', check_run_url: 'https://api.github.com/repos/acme/workspace/check-runs/300' }] });
} else if (endpoint === 'repos/acme/workspace/check-runs/300') {
  output({ name: data.requiredJobName, head_sha: data.sourceSha, status: 'completed', conclusion: 'success', app: { id: data.checkAppId, slug: 'github-actions' } });
} else if (endpoint === 'repos/acme/workspace/branches/main/protection') {
  output({
    required_status_checks: { strict: true, contexts: [], checks: [{ context: data.requiredJobName, app_id: data.checkAppId }] },
    enforce_admins: { enabled: !data.weakProtection },
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      require_code_owner_reviews: !data.weakCodeOwnerProtection,
      dismiss_stale_reviews: true,
      require_last_push_approval: false,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_conversation_resolution: { enabled: true },
  });
} else if (endpoint === 'repos/acme/workspace/actions/runs/200/artifacts') {
  output({ artifacts: [{ id: 400, name: data.actionsArtifactName, expired: data.expiredArtifact, digest: 'sha256:' + 'e'.repeat(64), size_in_bytes: 1234, archive_download_url: 'https://api.github.com/repos/acme/workspace/actions/artifacts/400/zip' }] });
} else if (endpoint === 'repos/acme/workspace/actions/artifacts/400') {
  output({ id: 400, name: data.actionsArtifactName, expired: false, digest: 'sha256:' + 'e'.repeat(64) });
} else if (endpoint === 'repos/acme/workspace/releases/tags/' + data.releaseTag) {
  output({
    id: 500,
    tag_name: data.releaseTag,
    draft: false,
    prerelease: true,
    assets: [
      { id: 501, name: data.artifactName, state: 'uploaded', digest: 'sha256:' + data.artifactSha, size: data.artifactSize, browser_download_url: 'https://github.com/acme/workspace/releases/download/' + data.releaseTag + '/' + data.artifactName },
      { id: 502, name: data.manifestName, state: 'uploaded', digest: 'sha256:' + data.manifestSha, size: fs.statSync(data.manifestPath).size, browser_download_url: 'https://github.com/acme/workspace/releases/download/' + data.releaseTag + '/' + data.manifestName },
    ],
  });
} else if (endpoint === 'repos/acme/workspace/git/ref/tags/' + data.releaseTag) {
  output({ object: { type: 'commit', sha: data.sourceSha } });
} else {
  process.stderr.write('unexpected mock endpoint: ' + endpoint + '\\n');
  process.exit(92);
}
`);
  chmodSync(ghPath, 0o755);

  const preloadPath = path.join(root, "fetch-preload.mjs");
  writeFileSync(preloadPath, `import fs from 'node:fs';
globalThis.fetch = async () => {
  const bytes = fs.readFileSync(process.env.MOCK_RELEASE_MANIFEST);
  return { ok: true, status: 200, arrayBuffer: async () => bytes };
};
`);

  return {
    root,
    data,
    preloadPath,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      MOCK_GITHUB_DATA: dataPath,
      MOCK_RELEASE_MANIFEST: manifestPath,
    },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}

function verificationArguments(fixture, output, { minimumRunId, timeoutSeconds = 1 } = {}) {
  const arguments_ = [
    "--import", fixture.preloadPath,
    evidenceCli,
    "verify-github",
    "--repository", fixture.data.repository,
    "--branch", "main",
    "--sha", fixture.data.sourceSha,
    "--tree", fixture.data.sourceTree,
    "--workflow-name", fixture.data.workflowName,
    "--workflow-path", fixture.data.workflowPath,
    "--required-job", fixture.data.requiredJobName,
    "--artifact-name-prefix", `workspace-standalone-${fixture.data.sourceSha}-run-`,
    "--event", fixture.data.event,
    "--release-tag-prefix", `ci-artifact-${fixture.data.sourceSha}-run-`,
    "--release-artifact-name", fixture.data.artifactName,
    "--release-manifest-name", fixture.data.manifestName,
    "--output", output,
    "--timeout-seconds", String(timeoutSeconds),
    "--poll-seconds", "1",
  ];
  if (minimumRunId !== undefined) arguments_.push("--minimum-run-id", String(minimumRunId));
  return arguments_;
}

test("verifies protected-main Actions bytes, prerelease digests, and classifier provenance", () => {
  const fixture = createGithubFixture({ runAttempt: 2 });
  try {
    const output = path.join(fixture.root, "evidence.json");
    const result = runNode(verificationArguments(fixture, output), { env: fixture.env });
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(evidence.github.requiredCheckAppId, checkAppId);
    assert.equal(evidence.github.runAttempt, 2);
    assert.equal(evidence.github.release.tagName, `ci-artifact-${sourceSha}-run-200-attempt-2`);
    assert.equal(evidence.github.branchProtection.lastPushApprovalRequired, false);
    assert.equal(evidence.github.branchProtection.pullRequestBypassAllowed, false);
    assert.equal(evidence.github.artifactProvenance.buildId, sourceSha);
    assert.deepEqual(evidence.github.artifactProvenance.requiredSuites, ["settings-save"]);

    const validation = runNode([
      evidenceCli, "validate-file",
      "--file", output,
      "--sha", sourceSha,
      "--tree", sourceTree,
      "--format", "lines",
    ]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(validation.stdout.trimEnd().split("\n").length, 16);

    const wrongRepository = runNode([
      evidenceCli, "validate-file",
      "--file", output,
      "--sha", sourceSha,
      "--tree", sourceTree,
      "--repository", "attacker/workspace",
    ]);
    assert.notEqual(wrongRepository.status, 0);
    assert.match(wrongRepository.stderr, /repository does not match the pinned release policy/);
  } finally {
    fixture.cleanup();
  }
});

test("refuses to fall back to an older successful run when the latest run failed", () => {
  const fixture = createGithubFixture({ latestFailure: true });
  try {
    const result = runNode(verificationArguments(fixture, path.join(fixture.root, "evidence.json")), { env: fixture.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /latest matching workflow run 201 concluded failure/);
  } finally {
    fixture.cleanup();
  }
});

test("a newer failure from another publishable event invalidates older same-SHA evidence", () => {
  const fixture = createGithubFixture({ newerEventFailure: true });
  try {
    const result = runNode(verificationArguments(fixture, path.join(fixture.root, "evidence.json")), { env: fixture.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /superseded by newer same-SHA run 201/);
  } finally {
    fixture.cleanup();
  }
});

test("a newer nightly failure invalidates older same-SHA release evidence", () => {
  const fixture = createGithubFixture({ newerScheduleFailure: true });
  try {
    const output = path.join(fixture.root, "evidence.json");
    const verification = runNode(verificationArguments(fixture, output), { env: fixture.env });
    assert.notEqual(verification.status, 0);
    assert.match(verification.stderr, /superseded by newer same-SHA run 201/);

    const viability = runNode([
      evidenceCli, "check-run-viable",
      "--repository", fixture.data.repository,
      "--branch", "main",
      "--sha", sourceSha,
      "--workflow-name", fixture.data.workflowName,
      "--workflow-path", fixture.data.workflowPath,
      "--event", fixture.data.event,
      "--run-id", "200",
      "--run-attempt", "1",
      "--artifact-name", fixture.data.actionsArtifactName,
    ], { env: fixture.env });
    assert.equal(viability.status, 3);
    assert.match(viability.stderr, /no longer the latest successful/);
  } finally {
    fixture.cleanup();
  }
});

test("accepts only a forced C3/full artifact for workflow_dispatch evidence", () => {
  const valid = createGithubFixture({ event: "workflow_dispatch" });
  const invalid = createGithubFixture({ event: "workflow_dispatch", dispatchFull: false });
  try {
    const validResult = runNode(verificationArguments(valid, path.join(valid.root, "evidence.json")), { env: valid.env });
    assert.equal(validResult.status, 0, validResult.stderr);

    const invalidResult = runNode(verificationArguments(invalid, path.join(invalid.root, "evidence.json")), { env: invalid.env });
    assert.notEqual(invalidResult.status, 0);
    assert.match(invalidResult.stderr, /workflow_dispatch artifact does not prove forced C3\/full execution/);
  } finally {
    valid.cleanup();
    invalid.cleanup();
  }
});

test("load validation rejects a syntactic bootstrap receipt attached to non-full push evidence", () => {
  const fixture = createGithubFixture();
  try {
    const output = path.join(fixture.root, "evidence.json");
    const generated = runNode(verificationArguments(fixture, output), { env: fixture.env });
    assert.equal(generated.status, 0, generated.stderr);
    const evidence = JSON.parse(readFileSync(output, "utf8"));
    evidence.deploymentBootstrap = {
      schemaVersion: 1,
      baselineSha: "c".repeat(40),
      legacy: {
        cnbCommitSha: "d".repeat(40),
        releaseId: "20260715164825-dddddddd",
        cnbBuildSn: "cnb-8gh-1jtif23er",
        runtimeVersion: "local-1784105165477",
        buildId: "local-1784105165133",
        cnbRepository: "acme/workspace",
      },
      database: { migrationCount: 1, migrationSetSha256: "e".repeat(64) },
    };
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    const result = runNode([
      evidenceCli, "validate-file", "--file", output,
      "--sha", fixture.data.sourceSha,
      "--tree", fixture.data.sourceTree,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fresh forced C3\/full workflow_dispatch/);
  } finally {
    fixture.cleanup();
  }
});

test("verify-github recomputes bootstrap history instead of trusting a well-formed context", () => {
  const gitFixture = bootstrapGitFixture();
  const fixture = createGithubFixture({
    event: "workflow_dispatch",
    fixtureSourceSha: gitFixture.candidate,
    fixtureSourceTree: gitFixture.tree,
  });
  try {
    const context = createBootstrapContext({
      cwd: gitFixture.root,
      baselineSha: gitFixture.baseline,
      candidateSha: gitFixture.candidate,
      legacyCnbCommitSha: gitFixture.legacy,
      legacyReleaseId: `20260715164825-${gitFixture.legacy.slice(0, 8)}`,
      legacyCnbBuildSn: "cnb-8gh-1jtif23er",
      legacyRuntimeVersion: "local-1784105165477",
      legacyBuildId: "local-1784105165133",
      legacyCnbRepository: "acme/workspace",
    });
    context.database.migrationSetSha256 = "f".repeat(64);
    const contextPath = path.join(fixture.root, "bootstrap-context.json");
    writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
    const args = verificationArguments(fixture, path.join(fixture.root, "evidence.json"));
    args.push("--bootstrap-context", contextPath);
    const result = runNode(args, { cwd: gitFixture.root, env: fixture.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bootstrap context does not match Git history/);
  } finally {
    fixture.cleanup();
    rmSync(gitFixture.root, { recursive: true, force: true });
  }
});

test("standalone validation rejects self-consistent evidence provenance tampering", () => {
  const fixture = createGithubFixture();
  try {
    const manifest = JSON.parse(readFileSync(fixture.data.manifestPath, "utf8"));
    manifest.inputs.packageLockSha256 = sha256(readFileSync(path.join(repositoryRoot, "package-lock.json")));
    manifest.inputs.migrationSetSha256 = migrationSetDigest(path.join(repositoryRoot, "prisma/migrations"));
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(fixture.data.manifestPath, manifestBytes);
    fixture.data.manifestSha = sha256(manifestBytes);
    writeFileSync(fixture.env.MOCK_GITHUB_DATA, `${JSON.stringify(fixture.data)}\n`);

    const output = path.join(fixture.root, "evidence.json");
    const generated = runNode(verificationArguments(fixture, output), { env: fixture.env });
    assert.equal(generated.status, 0, generated.stderr);
    const evidence = JSON.parse(readFileSync(output, "utf8"));
    evidence.github.artifactProvenance.requiredSuites = ["tampered-suite"];
    evidence.github.artifactProvenance.e2eSpecs = ["e2e/tampered.spec.ts"];
    evidence.github.artifactProvenance.classification.requiredSuites = ["tampered-suite"];
    evidence.github.artifactProvenance.classification.e2eSpecs = ["e2e/tampered.spec.ts"];
    writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);

    const result = runNode([
      evidenceCli, "validate-standalone",
      "--evidence", output,
      "--manifest", fixture.data.manifestPath,
      "--artifact", fixture.data.artifactPath,
      "--sha", fixture.data.sourceSha,
      "--tree", fixture.data.sourceTree,
      "--lock-file", path.join(repositoryRoot, "package-lock.json"),
      "--migrations", path.join(repositoryRoot, "prisma/migrations"),
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /provenance does not match the digest-verified standalone manifest/);
  } finally {
    fixture.cleanup();
  }
});

test("rejects a branch whose protection does not enforce required checks for admins", () => {
  const fixture = createGithubFixture({ weakProtection: true });
  try {
    const result = runNode(verificationArguments(fixture, path.join(fixture.root, "evidence.json")), { env: fixture.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /protection is weaker than the production release policy/);
  } finally {
    fixture.cleanup();
  }
});

test("rejects a branch whose quality-policy paths do not require code-owner review", () => {
  const fixture = createGithubFixture({ weakCodeOwnerProtection: true });
  try {
    const result = runNode(verificationArguments(fixture, path.join(fixture.root, "evidence.json")), { env: fixture.env });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /protection is weaker than the production release policy/);
  } finally {
    fixture.cleanup();
  }
});

test("artifact liveness distinguishes an expired run artifact for automatic full rerun", () => {
  const live = createGithubFixture();
  const expired = createGithubFixture({ expiredArtifact: true });
  try {
    const argumentsFor = (fixture) => [
      evidenceCli, "check-artifact-live",
      "--repository", fixture.data.repository,
      "--run-id", "200",
      "--artifact-name", fixture.data.actionsArtifactName,
    ];
    assert.equal(runNode(argumentsFor(live), { env: live.env }).status, 0);
    const expiredResult = runNode(argumentsFor(expired), { env: expired.env });
    assert.equal(expiredResult.status, 3);
    assert.match(expiredResult.stderr, /missing or expired/);
  } finally {
    live.cleanup();
    expired.cleanup();
  }
});

test("run viability upgrades stale, failed-rerun, and expired evidence without weakening final verification", () => {
  const live = createGithubFixture();
  const failedRerun = createGithubFixture({ latestFailure: true });
  const expired = createGithubFixture({ expiredArtifact: true });
  try {
    const argumentsFor = (fixture) => [
      evidenceCli, "check-run-viable",
      "--repository", fixture.data.repository,
      "--branch", "main",
      "--sha", sourceSha,
      "--workflow-name", fixture.data.workflowName,
      "--workflow-path", fixture.data.workflowPath,
      "--event", fixture.data.event,
      "--run-id", "200",
      "--run-attempt", "1",
      "--artifact-name", fixture.data.actionsArtifactName,
    ];
    assert.equal(runNode(argumentsFor(live), { env: live.env }).status, 0);
    const failedResult = runNode(argumentsFor(failedRerun), { env: failedRerun.env });
    assert.equal(failedResult.status, 3);
    assert.match(failedResult.stderr, /no longer the latest successful/);
    const expiredResult = runNode(argumentsFor(expired), { env: expired.env });
    assert.equal(expiredResult.status, 3);
    assert.match(expiredResult.stderr, /missing or expired/);
  } finally {
    live.cleanup();
    failedRerun.cleanup();
    expired.cleanup();
  }
});

test("forced dispatch ignores an older completed run until the newly triggered run appears", () => {
  const fixture = createGithubFixture({ event: "workflow_dispatch", delayedNewRun: true });
  try {
    const output = path.join(fixture.root, "evidence.json");
    const result = runNode(verificationArguments(fixture, output, { minimumRunId: 199, timeoutSeconds: 3 }), { env: fixture.env });
    assert.equal(result.status, 0, result.stderr);
    const evidence = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(evidence.github.runId, 200);
  } finally {
    fixture.cleanup();
  }
});

test("canonical packager refuses to reuse a build whose BUILD_ID is not the source SHA", () => {
  const root = mkdtempSync(path.join(tmpdir(), "standalone-packager-test-"));
  try {
    mkdirSync(path.join(root, "ops"));
    mkdirSync(path.join(root, ".next"));
    copyFileSync(path.join(repositoryRoot, "ops", "build-standalone-artifact.sh"), path.join(root, "ops", "build-standalone-artifact.sh"));
    writeFileSync(path.join(root, "tracked.txt"), "fixture\n");
    writeFileSync(path.join(root, ".next", "BUILD_ID"), `${"f".repeat(40)}\n`);
    for (const args of [
      ["init", "-q"],
      ["config", "user.email", "ci@example.test"],
      ["config", "user.name", "CI"],
      ["add", "tracked.txt"],
      ["commit", "-qm", "fixture"],
    ]) {
      const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    const source = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
    const tree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).stdout.trim();
    const result = spawnSync("bash", [path.join(root, "ops", "build-standalone-artifact.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_SOURCE_SHA: source,
        RELEASE_SOURCE_TREE: tree,
        STANDALONE_SKIP_NEXT_BUILD: "1",
        ALLOW_NON_LINUX_BUILD: "1",
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /BUILD_ID 等于 canonical source SHA/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
