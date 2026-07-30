const assert = require("node:assert/strict");
const test = require("node:test");

const { databaseEnvironmentContract } = require("./check-workspace-runtime.js");

const runtimeUrl = "postgresql://workspace_dev_runtime:secret@db:5432/workspace_dev?sslmode=verify-full&sslrootcert=%2Frun%2Fsecrets%2Fpostgres_ca";
const directUrl = "postgresql://workspace_dev_migrator:secret@db:5432/workspace_dev";

test("runtime database-only contract accepts DATABASE_URL without migration credentials", () => {
  const result = databaseEnvironmentContract(new Map(), { DATABASE_URL: runtimeUrl }, true, () => true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.databaseUrl, runtimeUrl);
});

test("runtime database-only contract rejects direct and shadow credentials from either source", () => {
  const withDirect = databaseEnvironmentContract(
    new Map(),
    { DATABASE_URL: runtimeUrl, DIRECT_URL: directUrl },
    true,
    () => true,
  );
  assert.match(withDirect.errors.join("\n"), /DIRECT_URL is forbidden/);

  const withShadow = databaseEnvironmentContract(
    new Map([["SHADOW_DATABASE_URL", "postgresql://migrator:secret@db/workspace_dev_shadow"]]),
    { DATABASE_URL: runtimeUrl },
    true,
    () => true,
  );
  assert.match(withShadow.errors.join("\n"), /SHADOW_DATABASE_URL is forbidden/);
});

test("runtime database-only contract enforces identity, database, and verify-full CA", () => {
  const check = (url, fileExists = () => true) => databaseEnvironmentContract(
    new Map(),
    { DATABASE_URL: url },
    true,
    fileExists,
  ).errors.join("\n");
  assert.match(check(runtimeUrl.replace("workspace_dev_runtime", "workspace_dev")), /username must be workspace_dev_runtime/);
  assert.match(check(runtimeUrl.replace("\/workspace_dev?", "\/other?")), /database must be workspace_dev/);
  assert.match(check(runtimeUrl.replace("sslmode=verify-full&", "")), /sslmode must be verify-full/);
  assert.match(check(runtimeUrl.replace("%2Frun%2Fsecrets%2Fpostgres_ca", "%2Ftmp%2Fca.crt")), /sslrootcert must be/);
  assert.match(check(runtimeUrl, () => false), /sslrootcert does not exist/);
});

test("default workspace contract keeps DATABASE_URL and DIRECT_URL requirements", () => {
  const valid = databaseEnvironmentContract(
    new Map([
      ["DATABASE_URL", runtimeUrl],
      ["DIRECT_URL", directUrl],
    ]),
  );
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.databaseUrl, directUrl);

  const missingDirect = databaseEnvironmentContract(new Map([["DATABASE_URL", runtimeUrl]]));
  assert.match(missingDirect.errors.join("\n"), /DIRECT_URL must use PostgreSQL/);
});
