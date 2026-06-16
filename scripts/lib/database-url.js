const os = require("os");
const path = require("path");

function expandTilde(input) {
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function requireDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required and must be an absolute file: path");
  }
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use file: for this SQLite deployment");
  }
  const dbPath = expandTilde(databaseUrl.slice("file:".length).replace(/^"|"$/g, ""));
  if (!path.isAbsolute(dbPath)) {
    throw new Error(`DATABASE_URL must be absolute; relative SQLite paths split data by cwd: ${dbPath}`);
  }
  return dbPath;
}

module.exports = { requireDatabasePath };
