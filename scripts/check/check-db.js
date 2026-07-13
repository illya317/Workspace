#!/usr/bin/env node

require("dotenv/config");
const { Client } = require("pg");

function requireDatabaseUrl() {
  const value = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
  if (!/^postgres(?:ql)?:\/\//.test(value)) throw new Error("DIRECT_URL or DATABASE_URL must be PostgreSQL");
  return value;
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl(), application_name: "workspace-db-check" });
  await client.connect();
  let exitCode = 0;
  try {
    for (const tableName of ["User", "Employee", "Department", "Position", "Resource"]) {
      const result = await client.query(`SELECT count(*)::int AS count FROM "${tableName}"`);
      if (result.rows[0].count === 0) {
        console.error(`❌ ${tableName} 表为空`);
        exitCode = 1;
      } else {
        console.log(`✅ ${tableName}: ${result.rows[0].count} 条`);
      }
    }

    const rootAdmin = await client.query('SELECT id FROM "User" WHERE username = $1 AND "canLogin" IS TRUE LIMIT 1', ["admin"]);
    if (rootAdmin.rowCount === 0) {
      console.error("❌ 未找到可登录的内置 admin 账号");
      exitCode = 1;
    } else {
      console.log("✅ 内置 admin 账号存在");
    }

    const integrity = await client.query(`
      SELECT
        (SELECT count(*)::int FROM "EmployeePosition" ep LEFT JOIN "Employee" e ON e.id = ep."employeeId" WHERE e.id IS NULL) AS orphan_edps,
        (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated) AS unvalidated_constraints
    `);
    if (integrity.rows[0].orphan_edps > 0 || integrity.rows[0].unvalidated_constraints > 0) {
      console.error(`❌ 数据完整性失败: orphan EDP=${integrity.rows[0].orphan_edps}, unvalidated constraints=${integrity.rows[0].unvalidated_constraints}`);
      exitCode = 1;
    } else {
      console.log("✅ PostgreSQL 外键与约束完整性正常");
    }
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
