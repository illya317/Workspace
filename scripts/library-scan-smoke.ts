import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

async function sourceSnapshot(root: string) {
  const rows: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const content = await readFile(absolutePath);
        rows.push(`${path.relative(root, absolutePath)}:${content.length}:${createHash("sha256").update(content).digest("hex")}`);
      }
    }
  }
  await walk(root);
  return rows.sort().join("\n");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const smokeRoot = path.resolve(".cache/library-scan-smoke", randomUUID());
  const sourceRoot = path.join(smokeRoot, "source");
  const runtimeRoot = path.join(smokeRoot, "runtime");
  const databaseUrl = process.env.SHADOW_DATABASE_URL?.trim() || "";
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error("SHADOW_DATABASE_URL must use PostgreSQL");
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!/(?:_shadow|_test)$/.test(databaseName)) throw new Error("Library scan smoke only accepts a database ending in _shadow or _test");
  await mkdir(path.join(sourceRoot, "01 公司基本情况"), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(path.join(sourceRoot, "01 公司基本情况", "duplicate-a.txt"), "same source bytes\n");
  await writeFile(path.join(sourceRoot, "01 公司基本情况", "duplicate-b.txt"), "same source bytes\n");
  await writeFile(path.join(sourceRoot, "large.bin"), Buffer.alloc(11 * 1024 * 1024, 7));

  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  delete process.env.SHADOW_DATABASE_URL;
  process.env.LIBRARY_SOURCE_ROOT = sourceRoot;
  process.env.LIBRARY_ROOT = runtimeRoot;
  execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema=./prisma"], { cwd: process.cwd(), env: process.env, stdio: "pipe" });

  const beforeFirstScan = await sourceSnapshot(sourceRoot);
  const [{ scanLibrary }, { prisma }] = await Promise.all([
    import("@workspace/library/server/scan"),
    import("@workspace/platform/server/prisma"),
  ]);
  try {
    const first = await scanLibrary("smoke");
    assert(first.errors.length === 0, `first scan errors: ${first.errors.join("; ")}`);
    assert(first.scanned === 3 && first.created === 3, "first scan must create all three files");
    assert(first.duplicates >= 1, "duplicate content must be reported");
    assert(first.manifestUid && first.manifestChecksumSha256, "first scan manifest is required");
    assert(await sourceSnapshot(sourceRoot) === beforeFirstScan, "first scan mutated source files");

    await rm(path.join(runtimeRoot, ".versions"), { recursive: true, force: true });
    const second = await scanLibrary("smoke");
    assert(second.errors.length === 0, `second scan errors: ${second.errors.join("; ")}`);
    assert(second.created === 0 && second.updated === 0 && second.unchanged === 3, "second scan must be idempotent");
    assert((await readdir(path.join(runtimeRoot, ".versions"))).length === 3, "missing managed files must be rehydrated without new versions");
    assert(await sourceSnapshot(sourceRoot) === beforeFirstScan, "second scan mutated source files");

    await writeFile(path.join(sourceRoot, "01 公司基本情况", "duplicate-a.txt"), "changed source bytes\n");
    const beforeThirdScan = await sourceSnapshot(sourceRoot);
    const third = await scanLibrary("smoke");
    assert(third.errors.length === 0, `third scan errors: ${third.errors.join("; ")}`);
    assert(third.updated === 1 && third.unchanged === 2, "content change must create exactly one new version");
    assert(await sourceSnapshot(sourceRoot) === beforeThirdScan, "third scan mutated source files");

    const [documents, versions, manifests] = await Promise.all([
      prisma.libraryDocument.count(),
      prisma.libraryDocumentVersion.count(),
      readdir(path.join(runtimeRoot, ".manifests", "scans")),
    ]);
    assert(documents === 3, `expected 3 documents, got ${documents}`);
    assert(versions === 4, `expected 4 immutable versions, got ${versions}`);
    assert(manifests.length === 3, `expected 3 manifests, got ${manifests.length}`);
    const large = await prisma.libraryDocument.findFirst({ where: { fileName: "large.bin" } });
    assert(large?.checksumSha256?.length === 64, "files above 10 MiB require SHA256");
    const managedFiles = await readdir(path.join(runtimeRoot, ".versions"));
    assert(managedFiles.length === 3, "managed version storage must be under runtime root");
    const sourceEntries = await readdir(sourceRoot);
    assert(!sourceEntries.some((name) => name.startsWith(".")), "source root must not receive hidden runtime directories");
    console.log("Library scan smoke passed: read-only source, full SHA256, immutable versions, duplicates and manifests verified.");
  } finally {
    await prisma.$disconnect();
    execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"], {
      cwd: process.cwd(), env: process.env, stdio: "pipe",
    });
    await rm(smokeRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
