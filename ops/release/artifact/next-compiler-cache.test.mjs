import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  prepareCompilerCache,
  storeCompilerCache,
} from "./next-compiler-cache.mjs";

const BASE_RUNTIME = { nodeVersion: "v22.17.0", platform: "linux", arch: "x64" };

function write(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "next-compiler-cache-"));
  const appRoot = "apps/finance";
  const outputRoot = path.join(root, ".cache/deploy-units/finance");
  write(path.join(root, "package-lock.json"), "lock-v1\n");
  write(path.join(root, "node_modules/next/package.json"), JSON.stringify({ name: "next", version: "16.0.0" }));
  write(path.join(root, "tsconfig.base.json"), "{}\n");
  write(path.join(root, "packages/core/tsconfig.json"), '{"extends":"../../tsconfig.base.json"}\n');
  write(path.join(root, appRoot, "tsconfig.json"), '{"extends":"../../tsconfig.base.json"}\n');
  write(path.join(root, appRoot, "next.config.ts"), "export default { output: 'standalone' };\n");
  write(path.join(root, "scripts/deploy/deploy-unit-spec.ts"), "export const units = ['finance'];\n");
  write(path.join(root, "scripts/deploy/deploy-unit-app-generator.ts"), "export const version = 1;\n");
  const contractFile = path.join(outputRoot, "deploy-unit-contract.json");
  const navigationManifestFile = path.join(outputRoot, "deploy-navigation-manifest.json");
  write(contractFile, JSON.stringify({
    id: "finance",
    build: { appRoot },
    compiler: { projects: ["packages/core/tsconfig.json"] },
  }));
  write(navigationManifestFile, JSON.stringify({ schemaVersion: 1, units: [{ id: "finance" }] }));
  const options = {
    repositoryRoot: root,
    unitId: "finance",
    appRoot,
    outputRoot,
    contractFile,
    navigationManifestFile,
    cacheRoot: path.join(root, ".cache/next-units/finance"),
    quarantineRoot: path.join(root, ".cache/quarantine/next-units"),
    buildDirectory: path.join(root, appRoot, ".next"),
    evidenceFile: path.join(outputRoot, "next-compiler-cache.json"),
    runtime: BASE_RUNTIME,
  };
  return { root, options };
}

function withOutputRoot(options, outputRoot) {
  const contractFile = path.join(outputRoot, "deploy-unit-contract.json");
  const navigationManifestFile = path.join(outputRoot, "deploy-navigation-manifest.json");
  write(contractFile, readFileSync(options.contractFile));
  write(navigationManifestFile, readFileSync(options.navigationManifestFile));
  return {
    ...options,
    outputRoot,
    contractFile,
    navigationManifestFile,
    evidenceFile: path.join(outputRoot, "next-compiler-cache.json"),
  };
}

function buildCache(options, value = "compiled-v1") {
  write(path.join(options.buildDirectory, "cache/compiler.bin"), value);
}

function quarantineEntries(options) {
  return existsSync(options.quarantineRoot) ? readdirSync(options.quarantineRoot) : [];
}

test("an absent cache is a clean miss and writes prepare evidence", () => {
  const { root, options } = fixture();
  try {
    const result = prepareCompilerCache(options);
    assert.equal(result.status, "miss");
    assert.equal(result.reason, "absent");
    assert.equal(result.quarantined, false);
    const evidence = JSON.parse(readFileSync(options.evidenceFile, "utf8"));
    assert.equal(evidence.inputDigest, result.inputDigest);
    assert.deepEqual(evidence.prepare, result);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("store creates a schema-v1 receipt that the next prepare can hit", () => {
  const { root, options } = fixture();
  try {
    buildCache(options);
    const stored = storeCompilerCache(options);
    assert.equal(stored.status, "miss");
    assert.equal(stored.reason, "absent");
    assert.equal(stored.stored, true);
    assert.equal(lstatSync(options.cacheRoot).isDirectory(), true);

    rmSync(options.buildDirectory, { recursive: true, force: true });
    write(path.join(root, "apps/finance/app/page.tsx"), "export default function Page() { return 'copy changed'; }\n");
    const prepared = prepareCompilerCache(options);
    assert.equal(prepared.status, "hit");
    assert.equal(prepared.reason, "receipt-matched");
    assert.equal(readFileSync(path.join(options.buildDirectory, "cache/compiler.bin"), "utf8"), "compiled-v1");
    const receipt = JSON.parse(readFileSync(path.join(options.cacheRoot, "receipt.json"), "utf8"));
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.inputDigest, prepared.inputDigest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a custom normalized in-repository output root reuses the same logical input receipt", () => {
  const { root, options } = fixture();
  try {
    buildCache(options);
    const stored = storeCompilerCache(options);
    rmSync(options.buildDirectory, { recursive: true, force: true });
    const custom = withOutputRoot(options, path.join(root, ".cache/custom-unit-output/finance"));
    const prepared = prepareCompilerCache(custom);
    assert.equal(prepared.status, "hit");
    assert.equal(prepared.inputDigest, stored.inputDigest);
    assert.equal(existsSync(custom.evidenceFile), true);
    const receipt = JSON.parse(readFileSync(path.join(options.cacheRoot, "receipt.json"), "utf8"));
    const inputPaths = Object.fromEntries(receipt.input.files.map((entry) => [entry.key, entry.path]));
    assert.equal(inputPaths["generated-contract"], "generated/deploy-unit-contract.json");
    assert.equal(inputPaths["generated-navigation"], "generated/deploy-navigation-manifest.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("config, lock, and runtime drift miss and quarantine the stale derived cache", async (t) => {
  const cases = [
    {
      name: "config",
      reason: "next-config-drift",
      mutate: ({ root }) => write(path.join(root, "apps/finance/next.config.ts"), "export default { output: 'standalone', reactStrictMode: true };\n"),
    },
    {
      name: "lock",
      reason: "package-lock-drift",
      mutate: ({ root }) => write(path.join(root, "package-lock.json"), "lock-v2\n"),
    },
    {
      name: "runtime",
      reason: "runtime-drift",
      mutate: ({ options }) => { options.runtime = { ...BASE_RUNTIME, nodeVersion: "v22.18.0" }; },
    },
  ];
  for (const driftCase of cases) {
    await t.test(driftCase.name, () => {
      const value = fixture();
      try {
        buildCache(value.options);
        storeCompilerCache(value.options);
        rmSync(value.options.buildDirectory, { recursive: true, force: true });
        driftCase.mutate(value);
        const result = prepareCompilerCache(value.options);
        assert.equal(result.status, "miss");
        assert.equal(result.reason, driftCase.reason);
        assert.equal(result.quarantined, true);
        assert.equal(existsSync(value.options.cacheRoot), false);
        assert.equal(quarantineEntries(value.options).length, 1);
      } finally {
        rmSync(value.root, { recursive: true, force: true });
      }
    });
  }
});

test("missing or tampered receipts are quarantined instead of reused", async (t) => {
  for (const receiptCase of ["missing", "tampered"]) {
    await t.test(receiptCase, () => {
      const { root, options } = fixture();
      try {
        buildCache(options);
        storeCompilerCache(options);
        rmSync(options.buildDirectory, { recursive: true, force: true });
        const receiptFile = path.join(options.cacheRoot, "receipt.json");
        if (receiptCase === "missing") rmSync(receiptFile);
        else write(receiptFile, '{"schemaVersion":1,"kind":"workspace-next-compiler-cache"}\n');
        const result = prepareCompilerCache(options);
        assert.equal(result.status, "miss");
        assert.equal(result.reason, receiptCase === "missing" ? "receipt-missing" : "receipt-invalid");
        assert.equal(result.quarantined, true);
        assert.equal(quarantineEntries(options).length, 1);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("a symlink cache root is rejected and quarantined without following it", () => {
  const { root, options } = fixture();
  try {
    const outside = path.join(root, "outside-cache");
    write(path.join(outside, "sentinel"), "keep-me");
    mkdirSync(path.dirname(options.cacheRoot), { recursive: true });
    symlinkSync(outside, options.cacheRoot, "dir");
    const result = prepareCompilerCache(options);
    assert.equal(result.status, "miss");
    assert.equal(result.reason, "cache-root-symlink");
    assert.equal(result.quarantined, true);
    assert.equal(readFileSync(path.join(outside, "sentinel"), "utf8"), "keep-me");
    const quarantined = path.join(options.quarantineRoot, quarantineEntries(options)[0]);
    assert.equal(lstatSync(quarantined).isSymbolicLink(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("appRoot rejects traversal and absolute paths before cache access", async (t) => {
  for (const appRoot of ["apps/../apps/finance", "/tmp/apps/finance"]) {
    await t.test(appRoot, () => {
      const { root, options } = fixture();
      try {
        assert.throws(
          () => prepareCompilerCache({ ...options, appRoot }),
          /appRoot must be a normalized repo-relative path/,
        );
        assert.equal(existsSync(options.cacheRoot), false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("normalized-looking path traversal cannot alias a governed cache root", () => {
  const { root, options } = fixture();
  try {
    const traversingCacheRoot = `${root}/.cache/next-units/../next-units/finance`;
    assert.throws(
      () => prepareCompilerCache({ ...options, cacheRoot: traversingCacheRoot }),
      /cacheRoot must be a normalized absolute path/,
    );
    assert.equal(existsSync(options.cacheRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("outputRoot rejects repository escape, traversal aliases, and symlink ancestors", async (t) => {
  await t.test("outside repository", () => {
    const { root, options } = fixture();
    try {
      const outside = path.join(path.dirname(root), `${path.basename(root)}-outside`);
      assert.throws(
        () => prepareCompilerCache({ ...options, outputRoot: outside }),
        /outputRoot must remain inside repositoryRoot/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await t.test("traversal alias", () => {
    const { root, options } = fixture();
    try {
      const traversal = `${root}/.cache/custom/../custom`;
      assert.throws(
        () => prepareCompilerCache({ ...options, outputRoot: traversal }),
        /outputRoot must be a normalized repository path/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await t.test("symlink output root", () => {
    const { root, options } = fixture();
    try {
      const realOutput = path.join(root, ".cache/real-unit-output");
      const linkedOutput = path.join(root, ".cache/linked-unit-output");
      withOutputRoot(options, realOutput);
      symlinkSync("real-unit-output", linkedOutput, "dir");
      assert.throws(
        () => prepareCompilerCache({
          ...options,
          outputRoot: linkedOutput,
          contractFile: path.join(linkedOutput, "deploy-unit-contract.json"),
          navigationManifestFile: path.join(linkedOutput, "deploy-navigation-manifest.json"),
          evidenceFile: path.join(linkedOutput, "next-compiler-cache.json"),
        }),
        /outputRoot must be a real directory|unsafe parent directory/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("a wrong-unit generated contract is rejected", () => {
  const { root, options } = fixture();
  try {
    write(options.contractFile, JSON.stringify({
      id: "hr",
      build: { appRoot: options.appRoot },
      compiler: { projects: ["packages/core/tsconfig.json"] },
    }));
    assert.throws(() => prepareCompilerCache(options), /contract unit does not match/);
    assert.equal(existsSync(options.cacheRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cache, quarantine, evidence, and build paths cannot target arbitrary roots", async (t) => {
  const cases = [
    ["cacheRoot", "arbitrary/cache"],
    ["quarantineRoot", "arbitrary/quarantine"],
    ["evidenceFile", "arbitrary/evidence.json"],
    ["buildDirectory", "arbitrary/build"],
  ];
  for (const [field, relative] of cases) {
    await t.test(field, () => {
      const { root, options } = fixture();
      try {
        assert.throws(
          () => prepareCompilerCache({ ...options, [field]: path.join(root, relative) }),
          new RegExp(`${field} must equal`),
        );
        assert.equal(existsSync(path.join(root, relative)), false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test("contract and navigation must be real files in the unit output root", async (t) => {
  await t.test("arbitrary contract location", () => {
    const { root, options } = fixture();
    try {
      const otherContract = path.join(root, "arbitrary/deploy-unit-contract.json");
      write(otherContract, readFileSync(options.contractFile));
      assert.throws(
        () => prepareCompilerCache({ ...options, contractFile: otherContract }),
        /contractFile must equal/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  await t.test("navigation symlink", () => {
    const { root, options } = fixture();
    try {
      const target = path.join(root, "navigation-target.json");
      write(target, readFileSync(options.navigationManifestFile));
      rmSync(options.navigationManifestFile);
      symlinkSync(target, options.navigationManifestFile);
      assert.throws(() => prepareCompilerCache(options), /deploy navigation manifest must be a real file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
