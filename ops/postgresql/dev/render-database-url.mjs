#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [role, database, passwordFile, applicationName] = process.argv.slice(2);
const identifierPattern = /^[a-z][a-z0-9_]*$/;

if (!identifierPattern.test(role ?? "") || !identifierPattern.test(database ?? "")) {
  throw new Error("Database role and database must be explicit lowercase PostgreSQL identifiers.");
}
if (!passwordFile?.startsWith("/run/secrets/")) {
  throw new Error("Database password must come from a mounted /run/secrets file.");
}
if (!applicationName || !/^[a-z0-9-]+$/.test(applicationName)) {
  throw new Error("Application name is required.");
}

const password = readFileSync(passwordFile, "utf8").replace(/[\r\n]+$/, "");
if (password.length < 32) {
  throw new Error("Database password secret is missing or too short.");
}
const caPath = "/run/secrets/postgres_ca";
readFileSync(caPath);

const url = new URL("postgresql://db:5432");
url.username = role;
url.password = password;
url.pathname = `/${database}`;
url.searchParams.set("schema", "public");
url.searchParams.set("sslmode", "verify-full");
url.searchParams.set("sslrootcert", caPath);
url.searchParams.set("application_name", applicationName);
process.stdout.write(url.toString());
