import assert from "node:assert/strict";
import {
  chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEPLOY_TOOL_BUNDLE_MANIFEST,
  buildDeployToolBundle,
  collectDeployToolClosure,
  verifyDeployToolBundle,
} from "./deploy-tool-bundle.mjs";
import {
  DEPLOY_TOOL_PROFILE_CATALOG_VERSION,
  deployToolProfileEntries,
  deployToolProfileNames,
} from "./deploy-tool-profiles.mjs";

function repository(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-repository-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

test("versioned profiles cover every release entry and current second-level dependency", () => {
  const root = path.resolve(new URL("../../..", import.meta.url).pathname);
  assert.equal(DEPLOY_TOOL_PROFILE_CATALOG_VERSION, 1);
  assert.deepEqual(deployToolProfileNames(), ["deploy-unit-tools", "full"]);
  const unitEntries = deployToolProfileEntries("deploy-unit-tools");
  for (const entry of [
    "ops/release/control/deploy-tool-bundle.mjs",
    "ops/apply-deploy-unit.sh",
    "ops/promote-deploy-profile.sh",
    "ops/rollback-deploy-profile.sh",
  ]) assert.ok(unitEntries.includes(entry));
  assert.ok(deployToolProfileEntries("full").includes("ops/release/control/deploy-tool-bundle.mjs"));
  const closure = collectDeployToolClosure(root, unitEntries);
  assert.ok(closure.files.includes("deploy-unit-release.mjs"));
  assert.ok(closure.files.includes("release/readiness/artifact-inspection.mjs"));
  assert.ok(closure.files.includes("release/contracts/deploy-unit-build-identity.mjs"));
  assert.ok(closure.files.includes("release/artifact/runtime-tree-permissions.mjs"));
});

test("static import, export-from, and dynamic import recurse through indirect modules", (t) => {
  const root = repository(t, {
    "ops/entry.mjs": 'import "./first.mjs";\n',
    "ops/first.mjs": 'export { value } from "./nested/second.mjs";\n',
    "ops/nested/second.mjs": 'export const value = import("../third.mjs");\n',
    "ops/third.mjs": "export default 3;\n",
  });
  const closure = collectDeployToolClosure(root, ["ops/entry.mjs"]);
  assert.deepEqual(closure.files, [
    "entry.mjs",
    "first.mjs",
    "nested/second.mjs",
    "third.mjs",
  ]);
});

test("missing, escaping, bare-package, and symlink dependencies fail closed", async (t) => {
  await t.test("missing", (nested) => {
    const root = repository(nested, { "ops/entry.mjs": 'import "./missing.mjs";\n' });
    assert.throws(
      () => collectDeployToolClosure(root, ["ops/entry.mjs"]),
      /import is missing/,
    );
  });
  await t.test("escape", (nested) => {
    const root = repository(nested, {
      "ops/entry.mjs": 'import "../outside.mjs";\n',
      "outside.mjs": "export default 1;\n",
    });
    assert.throws(
      () => collectDeployToolClosure(root, ["ops/entry.mjs"]),
      /import escapes ops/,
    );
  });
  await t.test("bare package", (nested) => {
    const root = repository(nested, { "ops/entry.mjs": 'import value from "left-pad";\n' });
    assert.throws(
      () => collectDeployToolClosure(root, ["ops/entry.mjs"]),
      /bare package import/,
    );
  });
  await t.test("symlink", (nested) => {
    const root = repository(nested, {
      "ops/entry.mjs": 'import "./linked.mjs";\n',
      "ops/real.mjs": "export default 1;\n",
    });
    symlinkSync(path.join(root, "ops/real.mjs"), path.join(root, "ops/linked.mjs"));
    assert.throws(
      () => collectDeployToolClosure(root, ["ops/entry.mjs"]),
      /must not use a symlink/,
    );
  });
});

test("bundle is built in an empty directory, syntax checked, and manifest tampering fails", (t) => {
  const root = repository(t, {
    "ops/entry.mjs": 'import "./nested/helper.mjs";\n',
    "ops/nested/helper.mjs": "export const helper = true;\n",
    "ops/tool.sh": "#!/usr/bin/env bash\nset -e\n",
  });
  const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-output-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const manifest = buildDeployToolBundle({
    repository: root,
    output,
    entrypoints: ["ops/entry.mjs", "ops/tool.sh"],
  });
  assert.deepEqual(manifest.entries, ["entry.mjs", "tool.sh"]);
  assert.deepEqual(manifest.files.map((file) => file.path), [
    "entry.mjs",
    "nested/helper.mjs",
    "tool.sh",
  ]);
  assert.equal(verifyDeployToolBundle(output).bundleDigest, manifest.bundleDigest);

  const manifestFile = path.join(output, DEPLOY_TOOL_BUNDLE_MANIFEST);
  const changed = JSON.parse(readFileSync(manifestFile, "utf8"));
  changed.entries = ["entry.mjs"];
  writeFileSync(manifestFile, JSON.stringify(changed));
  assert.throws(() => verifyDeployToolBundle(output), /manifest or digest is invalid/);
});

test("bundle output must start empty", (t) => {
  const root = repository(t, { "ops/entry.mjs": "export default true;\n" });
  const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-nonempty-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  writeFileSync(path.join(output, "stale"), "stale");
  assert.throws(() => buildDeployToolBundle({
    repository: root,
    output,
    entrypoints: ["ops/entry.mjs"],
  }), /empty directory/);
});
function copyDirectoryContents(source, target) {
  for (const name of readdirSync(source)) {
    cpSync(path.join(source, name), path.join(target, name), {
      recursive: true,
      preserveTimestamps: true,
    });
  }
}

test("mode drift fails exact bundle verification", (t) => {
  const root = repository(t, { "ops/entry.mjs": "export default true;\n" });
  const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-mode-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  buildDeployToolBundle({
    repository: root,
    output,
    entrypoints: ["ops/entry.mjs"],
  });
  chmodSync(path.join(output, "entry.mjs"), 0o644);
  assert.throws(() => verifyDeployToolBundle(output), /file mode changed/);
});

test("transferred bundle rejects missing transitive files and multiple stale files", async (t) => {
  await t.test("missing transitive file", (nested) => {
    const root = repository(nested, {
      "ops/entry.mjs": 'import "./nested/helper.mjs";\n',
      "ops/nested/helper.mjs": "export default true;\n",
    });
    const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-source-"));
    const transferred = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-transferred-"));
    nested.after(() => rmSync(output, { recursive: true, force: true }));
    nested.after(() => rmSync(transferred, { recursive: true, force: true }));
    buildDeployToolBundle({ repository: root, output, entrypoints: ["ops/entry.mjs"] });
    copyDirectoryContents(output, transferred);
    unlinkSync(path.join(transferred, "nested/helper.mjs"));
    assert.throws(() => verifyDeployToolBundle(transferred), /inventory does not match/);
  });

  await t.test("multiple stale files", (nested) => {
    const root = repository(nested, { "ops/entry.mjs": "export default true;\n" });
    const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-source-"));
    const transferred = mkdtempSync(path.join(tmpdir(), "deploy-tool-bundle-transferred-"));
    nested.after(() => rmSync(output, { recursive: true, force: true }));
    nested.after(() => rmSync(transferred, { recursive: true, force: true }));
    buildDeployToolBundle({ repository: root, output, entrypoints: ["ops/entry.mjs"] });
    copyDirectoryContents(output, transferred);
    mkdirSync(path.join(transferred, "legacy"), { recursive: true });
    writeFileSync(path.join(transferred, "stale-one.mjs"), "export default 1;\n");
    writeFileSync(path.join(transferred, "legacy/stale-two.sh"), "#!/bin/sh\n");
    assert.throws(() => verifyDeployToolBundle(transferred), /inventory does not match/);
  });
});

test("transport exact-syncs then remotely verifies before executing another deploy tool", () => {
  const transport = readFileSync(new URL("../../deploy/transport.sh", import.meta.url), "utf8");
  const exactTransfer = transport.indexOf('rsync -az --delete-delay -e "$RSYNC_SSH_COMMAND"');
  const remoteVerify = transport.indexOf(
    "node '$REMOTE_DEPLOY_TOOL_DIR/release/control/deploy-tool-bundle.mjs'",
  );
  const firstOtherRemoteTool = transport.indexOf(
    "node '$REMOTE_GATEWAY_GENERATION_TOOL' graph-digest",
  );
  assert.match(transport, /--profile full/);
  assert.doesNotMatch(transport, /--entry ops\//);
  assert.ok(exactTransfer >= 0);
  assert.ok(remoteVerify > exactTransfer);
  assert.ok(firstOtherRemoteTool > remoteVerify);
});
test("named profiles bind catalog version and missing catalog entries never fall back", (t) => {
  const root = path.resolve(new URL("../../..", import.meta.url).pathname);
  for (const profile of deployToolProfileNames()) {
    const output = mkdtempSync(path.join(tmpdir(), "deploy-tool-profile-" + profile + "-"));
    t.after(() => rmSync(output, { recursive: true, force: true }));
    const manifest = buildDeployToolBundle({ repository: root, output, profile });
    assert.deepEqual(manifest.profile, {
      name: profile,
      catalogVersion: DEPLOY_TOOL_PROFILE_CATALOG_VERSION,
    });
    assert.deepEqual(
      manifest.entries,
      deployToolProfileEntries(profile).map((entry) => entry.slice(4)).sort(),
    );
    verifyDeployToolBundle(output);
  }

  const incomplete = repository(t, {
    "ops/release/control/deploy-tool-bundle.mjs": "export default true;\n",
  });
  const incompleteOutput = mkdtempSync(path.join(tmpdir(), "deploy-tool-profile-incomplete-"));
  t.after(() => rmSync(incompleteOutput, { recursive: true, force: true }));
  assert.throws(
    () => buildDeployToolBundle({
      repository: incomplete,
      output: incompleteOutput,
      profile: "full",
    }),
    /entrypoint is missing/,
  );
});
