export interface E2eDatabaseTarget {
  connectionString: string;
  databaseName: string;
}

interface E2eDatabaseEnvironment {
  readonly [key: string]: string | undefined;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
}

function disposableDatabaseName(name: string, raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL for E2E`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use PostgreSQL for E2E`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/(?:_ci|_test|_e2e)$/.test(databaseName)) {
    throw new Error(`E2E only accepts disposable *_ci, *_test, or *_e2e databases; ${name} points to ${databaseName || "unknown"}`);
  }
  return databaseName;
}

export function requireDisposableE2eDatabase(
  env: E2eDatabaseEnvironment = process.env,
): E2eDatabaseTarget {
  const databaseUrl = (env.DATABASE_URL || "").trim();
  const directUrl = (env.DIRECT_URL || "").trim();
  if (!databaseUrl) throw new Error("E2E requires DATABASE_URL");

  const databaseName = disposableDatabaseName("DATABASE_URL", databaseUrl);
  if (directUrl) {
    const directDatabaseName = disposableDatabaseName("DIRECT_URL", directUrl);
    if (directDatabaseName !== databaseName) {
      throw new Error(`DATABASE_URL and DIRECT_URL must select the same E2E database; received ${databaseName} and ${directDatabaseName}`);
    }
  }
  return { connectionString: databaseUrl, databaseName };
}

export function requirePostgresqlCiDatabase(
  env: E2eDatabaseEnvironment = process.env,
): E2eDatabaseTarget {
  const target = requireDisposableE2eDatabase(env);
  if (!target.databaseName.endsWith("_ci")) {
    throw new Error(`PostgreSQL integration only accepts a *_ci database; received ${target.databaseName}`);
  }
  return target;
}
