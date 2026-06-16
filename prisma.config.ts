import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import path from "path";

type Env = {
  DATABASE_URL: string;
};

function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.CI) {
    return `file:${path.resolve(process.cwd(), ".cache/prisma/ci-dev.db")}`;
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
  },
});
