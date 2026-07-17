import assert from "node:assert/strict";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const builder = path.join(import.meta.dirname, "hotfix-remote-build.sh");
const imageDigest = `fixture/node@sha256:${"a".repeat(64)}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function git(repository, ...args) {
  return run("git", args, { cwd: repository }).stdout.trim();
}

function commit(repository, message) {
  git(repository, "add", ".");
  git(repository, "commit", "-qm", message);
  return git(repository, "rev-parse", "HEAD");
}

function createBundle(repository, sourceSha, baseSha, bundlePath) {
  git(repository, "checkout", "-q", sourceSha);
  git(repository, "bundle", "create", bundlePath, "HEAD", `^${baseSha}`);
}

function invokeBuilder({ root, mockBin, logPath, sourceSha, sourceTree, baseSha, bundlePath }) {
  return run("bash", [builder], {
    env: {
      ...process.env,
      PATH: `${mockBin}:${process.env.PATH}`,
      MOCK_DOCKER_LOG: logPath,
      REMOTE_DIR: root,
      REMOTE_WORKSPACE_CONFIG_DIR: path.join(root, ".workspace"),
      REMOTE_AGENT_SOURCE_DIR: path.join(root, "source/Workspace"),
      REMOTE_HOTFIX_BUILD_ROOT: path.join(root, ".hotfix-builds"),
      REMOTE_HOTFIX_CACHE_ROOT: path.join(root, ".hotfix-cache"),
      SOURCE_SHA: sourceSha,
      SOURCE_TREE: sourceTree,
      BASE_SHA: baseSha,
      BUNDLE_PATH: bundlePath,
      HOTFIX_NODE_IMAGE: "fixture/node:24",
      HOTFIX_BUILD_CPUS: "3",
      HOTFIX_BUILD_MEMORY: "10g",
    },
  });
}

function logLines(logPath) {
  const contents = readFileSync(logPath, "utf8").trim();
  return contents ? contents.split("\n") : [];
}

test("remote hotfix builder reuses dependencies and exact-source artifacts but rebuilds corruption", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "hotfix-builder-integration-"));
  try {
    const development = path.join(fixtureRoot, "development");
    const remoteRoot = path.join(fixtureRoot, "remote");
    const remoteRepository = path.join(remoteRoot, "source/Workspace");
    const mockBin = path.join(fixtureRoot, "bin");
    const logPath = path.join(fixtureRoot, "docker.log");
    mkdirSync(development, { recursive: true });
    mkdirSync(mockBin, { recursive: true });
    writeFileSync(logPath, "");

    git(development, "init", "-q");
    git(development, "config", "user.email", "ci@example.test");
    git(development, "config", "user.name", "CI");
    writeFileSync(path.join(development, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
    writeFileSync(path.join(development, "package-lock.json"), '{"name":"fixture","version":"1.0.0","lockfileVersion":3,"packages":{}}\n');
    writeFileSync(path.join(development, ".node-version"), "24\n");
    writeFileSync(path.join(development, "application.txt"), "base\n");
    const baseSha = commit(development, "base");
    writeFileSync(path.join(development, "application.txt"), "source one\n");
    const sourceOne = commit(development, "source one");
    const treeOne = git(development, "rev-parse", `${sourceOne}^{tree}`);

    mkdirSync(path.dirname(remoteRepository), { recursive: true });
    run("git", ["clone", "-q", development, remoteRepository]);
    git(remoteRepository, "checkout", "-q", baseSha);

    const flock = path.join(mockBin, "flock");
    writeFileSync(flock, "#!/bin/bash\nexit 0\n");
    chmodSync(flock, 0o755);

    const docker = path.join(mockBin, "docker");
    writeFileSync(docker, `#!/bin/bash
set -eo pipefail
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  if printf '%s\\n' "$@" | grep -q RepoDigests; then
    printf '%s\\n' '${imageDigest}'
  elif printf '%s\\n' "$@" | grep -q Architecture; then
    printf '%s\\n' 'linux/amd64'
  fi
  printf '%s\\n' 'IMAGE inspect' >> "$MOCK_DOCKER_LOG"
  exit 0
fi
if [ "$1" = "pull" ]; then
  printf '%s\\n' 'IMAGE pull' >> "$MOCK_DOCKER_LOG"
  exit 0
fi
if [ "$1" != "run" ]; then
  exit 64
fi

worktree=''
source_sha=''
source_tree=''
mounts=''
last=''
while [ "$#" -gt 0 ]; do
  argument="$1"
  shift
  last="$argument"
  case "$argument" in
    -w)
      worktree="$1"
      shift
      ;;
    -e)
      assignment="$1"
      shift
      case "$assignment" in
        RELEASE_SOURCE_SHA=*) source_sha="$(printf '%s' "$assignment" | sed 's/^RELEASE_SOURCE_SHA=//')" ;;
        RELEASE_SOURCE_TREE=*) source_tree="$(printf '%s' "$assignment" | sed 's/^RELEASE_SOURCE_TREE=//')" ;;
      esac
      ;;
    -v)
      mount="$1"
      shift
      mounts="$mounts $mount"
      ;;
  esac
done

if printf '%s' "$last" | grep -q 'npm ci --no-audit'; then
  mkdir -p "$worktree/node_modules/next"
  printf '%s\\n' '{"version":"16.2.6"}' > "$worktree/node_modules/next/package.json"
  printf 'RUN install %s\\n' "$(git -C "$worktree" rev-parse HEAD)" >> "$MOCK_DOCKER_LOG"
  exit 0
fi

printf '%s' "$mounts" | grep -Fq "$worktree/node_modules:ro"
mkdir -p "$worktree/.next"
artifact="$worktree/.next/workspace-standalone.tgz"
manifest="$worktree/.next/workspace-standalone.manifest.json"
printf 'artifact:%s\\n' "$source_sha" > "$artifact"
artifact_sha="$(sha256sum "$artifact" | awk '{print $1}')"
artifact_size="$(wc -c < "$artifact" | tr -d ' ')"
ARTIFACT_SHA="$artifact_sha" ARTIFACT_SIZE="$artifact_size" MANIFEST_PATH="$manifest" SOURCE_SHA="$source_sha" SOURCE_TREE="$source_tree" node <<'NODE'
const fs = require("fs");
const manifest = {
  schemaVersion: 1,
  source: { commitSha: process.env.SOURCE_SHA, treeSha: process.env.SOURCE_TREE },
  inputs: { packageLockSha256: "b".repeat(64), migrationSetSha256: "c".repeat(64) },
  artifact: {
    fileName: "workspace-standalone.tgz",
    sha256: process.env.ARTIFACT_SHA,
    sizeBytes: Number(process.env.ARTIFACT_SIZE),
  },
  build: {
    buildId: process.env.SOURCE_SHA,
    nodeVersion: "v24.14.0",
    platform: "linux",
    architecture: "x64",
  },
};
fs.writeFileSync(process.env.MANIFEST_PATH, JSON.stringify(manifest) + "\\n");
NODE
printf 'RUN build %s\\n' "$source_sha" >> "$MOCK_DOCKER_LOG"
`, { mode: 0o755 });
    chmodSync(docker, 0o755);

    const buildRoot = path.join(remoteRoot, ".hotfix-builds");
    mkdirSync(buildRoot, { recursive: true });
    const bundleOne = path.join(buildRoot, `${sourceOne}.bundle`);
    createBundle(development, sourceOne, baseSha, bundleOne);
    const cold = invokeBuilder({
      root: remoteRoot,
      mockBin,
      logPath,
      sourceSha: sourceOne,
      sourceTree: treeOne,
      baseSha,
      bundlePath: bundleOne,
    });
    assert.match(cold.stdout, /依赖缓存未命中/);
    assert.deepEqual(logLines(logPath).filter((line) => line.startsWith("RUN ")), [
      `RUN install ${sourceOne}`,
      `RUN build ${sourceOne}`,
    ]);

    const afterColdLog = logLines(logPath);
    createBundle(development, sourceOne, baseSha, bundleOne);
    const exactRetry = invokeBuilder({
      root: remoteRoot,
      mockBin,
      logPath,
      sourceSha: sourceOne,
      sourceTree: treeOne,
      baseSha,
      bundlePath: bundleOne,
    });
    assert.match(exactRetry.stdout, /跳过重复 install\/build/);
    assert.deepEqual(logLines(logPath), afterColdLog, "exact-source reuse must not invoke Docker");

    writeFileSync(path.join(development, "application.txt"), "source two\n");
    const sourceTwo = commit(development, "source two");
    const treeTwo = git(development, "rev-parse", `${sourceTwo}^{tree}`);
    const bundleTwo = path.join(buildRoot, `${sourceTwo}.bundle`);
    createBundle(development, sourceTwo, sourceOne, bundleTwo);
    const warmDependency = invokeBuilder({
      root: remoteRoot,
      mockBin,
      logPath,
      sourceSha: sourceTwo,
      sourceTree: treeTwo,
      baseSha: sourceOne,
      bundlePath: bundleTwo,
    });
    assert.match(warmDependency.stdout, /依赖缓存命中/);
    assert.deepEqual(logLines(logPath).filter((line) => line.startsWith("RUN ")), [
      `RUN install ${sourceOne}`,
      `RUN build ${sourceOne}`,
      `RUN build ${sourceTwo}`,
    ]);

    const artifactTwo = path.join(buildRoot, sourceTwo, "workspace-standalone.tgz");
    appendFileSync(artifactTwo, "corrupt\n");
    createBundle(development, sourceTwo, sourceOne, bundleTwo);
    const corruptionRetry = invokeBuilder({
      root: remoteRoot,
      mockBin,
      logPath,
      sourceSha: sourceTwo,
      sourceTree: treeTwo,
      baseSha: sourceOne,
      bundlePath: bundleTwo,
    });
    assert.match(corruptionRetry.stdout, /依赖缓存命中/);
    assert.doesNotMatch(corruptionRetry.stdout, /跳过重复 install\/build/);
    assert.deepEqual(logLines(logPath).filter((line) => line.startsWith("RUN ")), [
      `RUN install ${sourceOne}`,
      `RUN build ${sourceOne}`,
      `RUN build ${sourceTwo}`,
      `RUN build ${sourceTwo}`,
    ]);

    const dependencyCacheRoot = path.join(remoteRoot, ".hotfix-cache/node-modules");
    const cacheDirectories = readdirSync(dependencyCacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^[0-9a-f]{64}$/.test(entry.name));
    assert.equal(cacheDirectories.length, 1);
    const cacheDirectory = path.join(dependencyCacheRoot, cacheDirectories[0].name);
    assert.equal(readFileSync(path.join(cacheDirectory, ".complete"), "utf8").trim(), cacheDirectories[0].name);
    assert.ok(statSync(path.join(cacheDirectory, "node_modules/next/package.json")).isFile());
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
