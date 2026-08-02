#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const standaloneRoot = path.join(projectRoot, ".next/standalone");
const supportsProcessGroups = process.platform !== "win32";

export function parsePlaywrightPort(value = process.env.PLAYWRIGHT_PORT ?? "3000") {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function standaloneServerEnvironment(env, port) {
  return {
    ...env,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    PORT: String(port),
    WORKSPACE_PUBLIC_ORIGIN: env.WORKSPACE_PUBLIC_ORIGIN?.trim()
      || `http://127.0.0.1:${port}`,
  };
}

export function findStandaloneServer(root = standaloneRoot) {
  if (!fs.existsSync(root)) {
    throw new Error(`Next standalone output is missing: ${root}`);
  }

  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      if (entry.isFile() && entry.name === "server.js") matches.push(entryPath);
    }
  };
  visit(root);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Next standalone server.js under ${root}; found ${matches.length}`,
    );
  }
  return matches[0];
}

export function prepareStandaloneAssets({
  root = projectRoot,
  outputRoot = standaloneRoot,
} = {}) {
  const serverPath = findStandaloneServer(outputRoot);
  const appDirectory = path.dirname(serverPath);
  const staticSource = path.join(root, ".next/static");
  const publicSource = path.join(root, "public");
  const staticTarget = path.join(appDirectory, ".next/static");
  const publicTarget = path.join(appDirectory, "public");

  if (!fs.existsSync(staticSource)) {
    throw new Error(`Next static output is missing: ${staticSource}`);
  }
  fs.rmSync(staticTarget, { force: true, recursive: true });
  fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
  fs.cpSync(staticSource, staticTarget, { recursive: true });

  fs.rmSync(publicTarget, { force: true, recursive: true });
  if (fs.existsSync(publicSource)) {
    fs.cpSync(publicSource, publicTarget, { recursive: true });
  }

  return { appDirectory, serverPath };
}

function projectPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

export function validateArchiveEntryList(output) {
  const entries = output.split(/\r?\n/).filter(Boolean);
  if (entries.length === 0) throw new Error("Standalone archive is empty");
  for (const entry of entries) {
    const normalized = entry.replace(/^(?:\.\/)+/, "");
    if (normalized === "" || normalized === ".") continue;
    if (
      entry.includes("\\")
      || entry.includes("\0")
      || path.posix.isAbsolute(normalized)
      || /^[a-zA-Z]:/.test(normalized)
      || normalized.split("/").includes("..")
    ) {
      throw new Error(`Unsafe path in standalone archive: ${entry}`);
    }
  }
  return entries;
}

function validateExtractedLinks(root) {
  const rootWithSeparator = `${path.resolve(root)}${path.sep}`;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(entryPath);
        const resolvedTarget = path.resolve(path.dirname(entryPath), target);
        if (path.isAbsolute(target) || !`${resolvedTarget}${path.sep}`.startsWith(rootWithSeparator)) {
          throw new Error(`Unsafe symlink in standalone archive: ${entryPath} -> ${target}`);
        }
      } else if (entry.isDirectory()) {
        visit(entryPath);
      }
    }
  };
  visit(root);
}

export async function verifyStandaloneArchive({
  archivePath,
  manifestPath,
  expectedDigest,
  expectedCommit,
}) {
  if (!fs.existsSync(archivePath)) throw new Error(`Standalone archive is missing: ${archivePath}`);
  let requiredDigest = expectedDigest;

  if (manifestPath) {
    if (!fs.existsSync(manifestPath)) throw new Error(`Standalone manifest is missing: ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const manifestDigest = manifest?.artifact?.sha256;
    const manifestCommit = manifest?.source?.commitSha;
    if (!/^[0-9a-f]{64}$/.test(manifestDigest ?? "")) {
      throw new Error("Standalone manifest artifact.sha256 must be a lowercase SHA-256 digest");
    }
    if (expectedCommit && manifestCommit !== expectedCommit) {
      throw new Error(
        `Standalone manifest commit is ${manifestCommit ?? "missing"}, expected ${expectedCommit}`,
      );
    }
    if (requiredDigest && requiredDigest !== manifestDigest) {
      throw new Error("Standalone manifest digest does not match PLAYWRIGHT_STANDALONE_SHA256");
    }
    requiredDigest = manifestDigest;
  }

  if (requiredDigest && !/^[0-9a-f]{64}$/.test(requiredDigest)) {
    throw new Error("PLAYWRIGHT_STANDALONE_SHA256 must be a lowercase SHA-256 digest");
  }
  if (process.env.CI && !requiredDigest) {
    throw new Error("CI standalone archives require a manifest or PLAYWRIGHT_STANDALONE_SHA256");
  }
  if (requiredDigest) {
    const actualDigest = await sha256File(archivePath);
    if (actualDigest !== requiredDigest) {
      throw new Error(`Standalone archive SHA-256 is ${actualDigest}, expected ${requiredDigest}`);
    }
  }
}

function assertReusableBuild(root = projectRoot) {
  const buildIdPath = path.join(root, ".next/BUILD_ID");
  if (!fs.existsSync(buildIdPath)) {
    throw new Error("PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 requires .next/BUILD_ID");
  }

  const expectedBuildId = process.env.PLAYWRIGHT_STANDALONE_COMMIT
    ?? process.env.GITHUB_SHA
    ?? process.env.CNB_COMMIT_SHA
    ?? process.env.NEXT_PUBLIC_BUILD_VERSION;
  const actualBuildId = fs.readFileSync(buildIdPath, "utf8").trim();
  if (expectedBuildId && actualBuildId !== expectedBuildId) {
    throw new Error(
      `Refusing stale standalone output: BUILD_ID is ${actualBuildId}, expected ${expectedBuildId}`,
    );
  }

  findStandaloneServer(path.join(root, ".next/standalone"));
  if (!fs.existsSync(path.join(root, ".next/static"))) {
    throw new Error("PLAYWRIGHT_STANDALONE_SKIP_BUILD=1 requires .next/static");
  }
}

function signalProcessTree(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (supportsProcessGroups) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function runChild(command, args, { captureOutput = false, ...options }) {
  const child = spawn(command, args, {
    ...options,
    detached: supportsProcessGroups,
    stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  let stdout = "";
  if (captureOutput) child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  return {
    child,
    completed: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal, stdout }));
    }),
  };
}

export async function runE2eStandalone() {
  const port = parsePlaywrightPort();
  let activeChild = null;
  let requestedSignal = null;
  let killTimer = null;
  let extractedRuntimeRoot = null;

  const handleSignal = (signal) => {
    if (requestedSignal) return;
    requestedSignal = signal;
    signalProcessTree(activeChild, signal);
    killTimer = setTimeout(() => signalProcessTree(activeChild, "SIGKILL"), 8_000);
    killTimer.unref();
  };
  const handleSigint = () => handleSignal("SIGINT");
  const handleSigterm = () => handleSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    let runtime;
    const archiveValue = process.env.PLAYWRIGHT_STANDALONE_ARCHIVE;
    if (archiveValue) {
      const archivePath = projectPath(archiveValue);
      const manifestPath = process.env.PLAYWRIGHT_STANDALONE_MANIFEST
        ? projectPath(process.env.PLAYWRIGHT_STANDALONE_MANIFEST)
        : undefined;
      await verifyStandaloneArchive({
        archivePath,
        manifestPath,
        expectedDigest: process.env.PLAYWRIGHT_STANDALONE_SHA256,
        expectedCommit: process.env.PLAYWRIGHT_STANDALONE_COMMIT
          ?? process.env.GITHUB_SHA
          ?? process.env.CNB_COMMIT_SHA,
      });

      const listing = runChild("tar", ["-tzf", archivePath], {
        captureOutput: true,
        cwd: projectRoot,
        env: process.env,
      });
      activeChild = listing.child;
      const listingResult = await listing.completed;
      activeChild = null;
      if (requestedSignal) return requestedSignal === "SIGINT" ? 130 : 143;
      if (listingResult.code !== 0) {
        throw new Error(`Unable to inspect standalone archive: ${listingResult.signal ?? listingResult.code}`);
      }
      validateArchiveEntryList(listingResult.stdout);

      extractedRuntimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-e2e-runtime-"));
      const extraction = runChild("tar", ["-xzf", archivePath, "-C", extractedRuntimeRoot], {
        cwd: projectRoot,
        env: process.env,
      });
      activeChild = extraction.child;
      const extractionResult = await extraction.completed;
      activeChild = null;
      if (requestedSignal) return requestedSignal === "SIGINT" ? 130 : 143;
      if (extractionResult.code !== 0) {
        throw new Error(`Unable to extract standalone archive: ${extractionResult.signal ?? extractionResult.code}`);
      }
      validateExtractedLinks(extractedRuntimeRoot);
      const serverPath = findStandaloneServer(extractedRuntimeRoot);
      const appDirectory = path.dirname(serverPath);
      if (!fs.existsSync(path.join(appDirectory, ".next/static"))) {
        throw new Error("Canonical standalone archive is missing app .next/static");
      }
      runtime = { appDirectory, serverPath };
    } else if (process.env.PLAYWRIGHT_STANDALONE_SKIP_BUILD === "1") {
      assertReusableBuild();
      runtime = prepareStandaloneAssets();
    } else {
      throw new Error(
        "E2E never builds Next itself; set PLAYWRIGHT_STANDALONE_ARCHIVE or reuse a verified local build with PLAYWRIGHT_STANDALONE_SKIP_BUILD=1",
      );
    }

    const { appDirectory, serverPath } = runtime;
    const server = runChild(process.execPath, [serverPath], {
      cwd: appDirectory,
      env: standaloneServerEnvironment(process.env, port),
    });
    activeChild = server.child;
    const result = await server.completed;
    activeChild = null;
    if (requestedSignal) return requestedSignal === "SIGINT" ? 130 : 143;
    if (result.code !== 0) {
      throw new Error(`Next standalone server stopped with ${result.signal ?? result.code}`);
    }
    return 0;
  } finally {
    if (killTimer) clearTimeout(killTimer);
    signalProcessTree(activeChild, "SIGTERM");
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    if (extractedRuntimeRoot) {
      fs.rmSync(extractedRuntimeRoot, { force: true, recursive: true });
    }
  }
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runE2eStandalone()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
