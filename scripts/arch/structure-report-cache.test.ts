import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadOrCreateStructureReport,
  structureReportCacheFile,
} from "./structure-report-cache";

type FixtureReport = { kind: "fixture"; build: number };

function isFixtureReport(value: unknown): value is FixtureReport {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as Partial<FixtureReport>).kind === "fixture"
    && Number.isInteger((value as Partial<FixtureReport>).build);
}

function withCacheDirectory(run: (cacheDir: string) => void) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "structure-report-cache-"));
  try {
    run(cacheDir);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

test("reuses one serialized report for the same valid snapshot key", () => {
  withCacheDirectory((cacheDir) => {
    let builds = 0;
    const options = {
      cacheDir,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "a".repeat(64) },
      validateReport: isFixtureReport,
      createReport: (): FixtureReport => ({ kind: "fixture", build: ++builds }),
    };

    assert.deepEqual(loadOrCreateStructureReport(options), { kind: "fixture", build: 1 });
    assert.deepEqual(loadOrCreateStructureReport(options), { kind: "fixture", build: 1 });
    assert.equal(builds, 1);
  });
});

test("treats malformed or invalid cached data as a miss and replaces it atomically", () => {
  withCacheDirectory((cacheDir) => {
    const snapshotKey = "b".repeat(64);
    const cacheFile = structureReportCacheFile(cacheDir, snapshotKey);
    fs.writeFileSync(cacheFile, "{not-json\n");
    let builds = 0;

    const options = {
      cacheDir,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: snapshotKey },
      validateReport: isFixtureReport,
      createReport: (): FixtureReport => ({ kind: "fixture", build: ++builds }),
    };

    assert.deepEqual(loadOrCreateStructureReport(options), { kind: "fixture", build: 1 });
    fs.writeFileSync(cacheFile, JSON.stringify({
      schemaVersion: 1,
      snapshotKey,
      report: { kind: "invalid" },
    }));
    const report = loadOrCreateStructureReport(options);

    assert.deepEqual(report, { kind: "fixture", build: 2 });
    assert.equal(builds, 2);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(cacheFile, "utf8")));
    assert.deepEqual(fs.readdirSync(cacheDir).filter((file) => file.endsWith(".tmp")), []);
  });
});

test("uses independent serialized reports for different snapshot keys", () => {
  withCacheDirectory((cacheDir) => {
    let builds = 0;
    const createReport = (): FixtureReport => ({ kind: "fixture", build: ++builds });
    const baseOptions = { cacheDir, validateReport: isFixtureReport, createReport };

    assert.equal(loadOrCreateStructureReport({
      ...baseOptions,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "c".repeat(64) },
    }).build, 1);
    assert.equal(loadOrCreateStructureReport({
      ...baseOptions,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "d".repeat(64) },
    }).build, 2);
    assert.equal(loadOrCreateStructureReport({
      ...baseOptions,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "c".repeat(64) },
    }).build, 1);
    assert.equal(builds, 2);
  });
});

test("bypasses the cache when disabled or when the snapshot key is invalid", () => {
  withCacheDirectory((cacheDir) => {
    let builds = 0;
    const createReport = (): FixtureReport => ({ kind: "fixture", build: ++builds });
    const baseOptions = { cacheDir, validateReport: isFixtureReport, createReport };

    loadOrCreateStructureReport({
      ...baseOptions,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "e".repeat(64), CHECK_RESULT_CACHE: "0" },
    });
    loadOrCreateStructureReport({
      ...baseOptions,
      env: { CHECK_WORKSPACE_SNAPSHOT_KEY: "not-a-snapshot" },
    });

    assert.equal(builds, 2);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
  });
});
