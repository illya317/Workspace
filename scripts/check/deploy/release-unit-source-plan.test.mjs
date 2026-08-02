// workspace-test-filesystem: isolated
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveReleaseUnitSourceClosure } from "./release-unit-source-plan.mjs";

function graphFor(appRoot = "apps/news") {
  return {
    units: [{
      id: "news",
      privateSourceRoots: ["app/(modules)/news/", "app/api/modules/news/", "packages/news/"],
      compilerProjects: [
        "packages/core/tsconfig.json",
        "packages/news/tsconfig.json",
        "packages/platform/tsconfig.json",
        "tsconfig.prisma-client.json",
      ],
      runtime: { appRoot },
      checks: { typecheckScopes: ["app-news", "news"] },
    }],
  };
}

function sourceFixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-release-unit-plan-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.writeFileSync(path.join(cwd, "tsconfig.prisma-client.json"), JSON.stringify({
    compilerOptions: { rootDir: "generated/prisma" },
  }));
  for (const root of [
    "app/(modules)/news",
    "app/api/modules/news",
    "generated/prisma",
    "packages/core",
    "packages/news",
    "packages/platform",
  ]) {
    fs.mkdirSync(path.join(cwd, root), { recursive: true });
    fs.writeFileSync(path.join(cwd, root, "source.ts"), "export const source = true;\n");
  }
  return cwd;
}

test("release lint keeps every canonical source root and excludes only the generated app mirror", (t) => {
  const cwd = sourceFixture(t);

  const closure = resolveReleaseUnitSourceClosure({ cwd, targetId: "news", graph: graphFor() });
  assert.deepEqual(closure.lintRoots, [
    "app/(modules)/news",
    "app/api/modules/news",
    "generated/prisma",
    "packages/core",
    "packages/news",
    "packages/platform",
  ]);
  assert.deepEqual(closure.generatedMirrorRoots, ["apps/news"]);
  assert.equal(closure.lintRoots.includes("apps/news"), false);
});

test("release lint fails closed instead of excluding a non-canonical runtime source root", (t) => {
  const cwd = sourceFixture(t);

  assert.throws(
    () => resolveReleaseUnitSourceClosure({ cwd, targetId: "news", graph: graphFor("runtime/news") }),
    /may exclude only the generated deploy-unit mirror apps\/news/,
  );
});

test("release lint fails closed when a retained source root is missing or has no lintable input", (t) => {
  const missingCwd = sourceFixture(t);
  fs.rmSync(path.join(missingCwd, "app/api/modules/news"), { recursive: true });
  assert.throws(
    () => resolveReleaseUnitSourceClosure({ cwd: missingCwd, targetId: "news", graph: graphFor() }),
    /release lint root is missing: app\/api\/modules\/news/,
  );

  const emptyCwd = sourceFixture(t);
  fs.rmSync(path.join(emptyCwd, "generated/prisma/source.ts"));
  fs.writeFileSync(path.join(emptyCwd, "generated/prisma/README.md"), "generated output pending\n");
  assert.throws(
    () => resolveReleaseUnitSourceClosure({ cwd: emptyCwd, targetId: "news", graph: graphFor() }),
    /no lintable JavaScript\/TypeScript source: generated\/prisma/,
  );
});
