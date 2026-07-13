function requireDatabaseUrl() {
  const databaseUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DIRECT_URL or DATABASE_URL must use PostgreSQL");
  }
  return databaseUrl;
}

module.exports = { requireDatabaseUrl };
