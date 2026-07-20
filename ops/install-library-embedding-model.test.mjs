import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const installer = path.join(import.meta.dirname, "install-library-embedding-model.sh");

function writeDistribution(sitePackages, directory, name, version) {
  const distInfo = path.join(sitePackages, `${directory}-${version}.dist-info`);
  mkdirSync(distInfo, { recursive: true });
  writeFileSync(path.join(distInfo, "METADATA"), `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n`);
}

test("Qwen quick check validates the completed marker without loading the model", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qwen-quick-check-"));
  try {
    const venv = path.join(root, "venv");
    const model = path.join(root, "model");
    const sitePackages = path.join(root, "site-packages");
    mkdirSync(path.join(venv, "bin"), { recursive: true });
    mkdirSync(model, { recursive: true });
    writeDistribution(sitePackages, "sentence_transformers", "sentence-transformers", "5.6.0");
    writeDistribution(sitePackages, "modelscope", "modelscope", "1.38.1");

    const pythonWrapper = path.join(venv, "bin/python");
    writeFileSync(pythonWrapper, `#!/bin/bash\nPYTHONPATH='${sitePackages}' exec python3 "$@"\n`);
    chmodSync(pythonWrapper, 0o755);
    writeFileSync(path.join(model, "config.json"), "{}\n");
    writeFileSync(path.join(model, "model-00001-of-00002.safetensors"), "fixture\n");
    writeFileSync(path.join(model, ".workspace-embedding-model.json"), JSON.stringify({
      dimensions: 1024,
      model: "Qwen/Qwen3-Embedding-0.6B",
      revision: "master",
    }) + "\n");

    const result = spawnSync("bash", [installer, "--quick-check", "--venv", venv, "--model-dir", model], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /"mode": "quick-check"/);
    assert.doesNotMatch(result.stdout + result.stderr, /Checking Qwen embedding model on CPU/);

    writeFileSync(path.join(model, ".workspace-embedding-model.json"), JSON.stringify({
      dimensions: 1024,
      model: "Qwen/Qwen3-Embedding-0.6B",
      revision: "stale-revision",
    }) + "\n");
    const stale = spawnSync("bash", [installer, "--quick-check", "--venv", venv, "--model-dir", model], {
      encoding: "utf8",
    });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /embedding install marker is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
