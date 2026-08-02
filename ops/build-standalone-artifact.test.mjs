import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("canonical packager embeds the source code analysis snapshot beside the runtime entry", () => {
  const source = readFileSync(path.join(repositoryRoot, "ops/build-standalone-artifact.sh"), "utf8");
  assert.match(source, /source-code-analysis\/snapshot\.json/);
  assert.match(source, /standalone_app_dir\/\.workspace\/source-code-analysis/);
  assert.match(source, /禁止组装 standalone artifact/);
  assert.doesNotMatch(source, /next_compiler_cache/);
  assert.doesNotMatch(source, /source-code-analysis:snapshot:optional/);
});

test("canonical packager rewrites the shared dependency root inside the portable artifact", () => {
  const source = readFileSync(path.join(repositoryRoot, "ops/build-standalone-artifact.sh"), "utf8");
  assert.match(source, /standalone_app_dir\/node_modules/);
  assert.match(source, /node_modules\/next\/package\.json/);
  assert.match(source, /realpath --relative-to=/);
  assert.match(source, /standalone symlink escapes the portable runtime/);
  assert.match(source, /runtime-tree-permissions\.mjs normalize --root \.next\/standalone/);
  assert.match(source, /tar -C \.next\/standalone/);
  assert.doesNotMatch(source, /tar --dereference/);
});

test("canonical packager refuses to reuse a build whose BUILD_ID is not the candidate content digest", () => {
  const root = mkdtempSync(path.join(tmpdir(), "standalone-packager-test-"));
  try {
    mkdirSync(path.join(root, "ops"), { recursive: true });
    mkdirSync(path.join(root, ".next"));
    copyFileSync(path.join(repositoryRoot, "ops/build-standalone-artifact.sh"), path.join(root, "ops/build-standalone-artifact.sh"));
    writeFileSync(path.join(root, "tracked.txt"), "fixture\n");
    writeFileSync(path.join(root, ".next/BUILD_ID"), `${"f".repeat(40)}\n`);
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
    const contentDigest = "a".repeat(64);
    const result = spawnSync("bash", [path.join(root, "ops/build-standalone-artifact.sh")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_SOURCE_SHA: source,
        RELEASE_SOURCE_TREE: tree,
        RELEASE_CONTENT_DIGEST: contentDigest,
        STANDALONE_SKIP_NEXT_BUILD: "1",
        ALLOW_NON_LINUX_BUILD: "1",
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /BUILD_ID 等于候选内容摘要/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
