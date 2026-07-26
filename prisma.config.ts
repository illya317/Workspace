import "dotenv/config";
import { defineConfig, env } from "prisma/config";
type Env = {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  SHADOW_DATABASE_URL?: string;
};

function resolveDatabaseUrl(): string {
  const configured = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (configured) {
    if (!/^postgres(?:ql)?:\/\//.test(configured)) {
      throw new Error("DIRECT_URL/DATABASE_URL must use postgresql:// for the PostgreSQL deployment");
    }
    return configured;
  }
  return env<Env>("DATABASE_URL");
}

export default defineConfig({
  schema: "./prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl(),
    ...(process.env.SHADOW_DATABASE_URL?.trim()
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL.trim() }
      : {}),
  },
});
