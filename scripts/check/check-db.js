const Database = require("better-sqlite3");
const { requireDatabasePath } = require('../lib/database-url.js');
function countRows(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

async function main() {
  const db = new Database(requireDatabasePath());
  let exitCode = 0;

  // 1. 检查核心表是否有数据
  const checks = [
    { name: "User", count: countRows(db, "User") },
    { name: "Employee", count: countRows(db, "Employee") },
    { name: "Department", count: countRows(db, "Department") },
    { name: "Position", count: countRows(db, "Position") },
    { name: "Resource", count: countRows(db, "Resource") },
    { name: "Role", count: countRows(db, "Role") },
  ];

  for (const c of checks) {
    if (c.count === 0) {
      console.error(`❌ ${c.name} 表为空`);
      exitCode = 1;
    } else {
      console.log(`✅ ${c.name}: ${c.count} 条`);
    }
  }

  // 2. 检查内置 root admin 账号是否存在
  const rootAdmin = db.prepare('SELECT id FROM "User" WHERE username = ? AND canLogin = 1 LIMIT 1').get("admin");
  if (!rootAdmin) {
    console.error("❌ 未找到可登录的内置 admin 账号");
    exitCode = 1;
  } else {
    console.log("✅ 内置 admin 账号存在");
  }

  // 3. 检查外键完整性抽样
  const orphanEDPs = db
    .prepare(
      'SELECT COUNT(*) AS count FROM "EmployeePosition" WHERE employeeId NOT IN (SELECT id FROM "Employee")'
    )
    .get().count;
  if (orphanEDPs > 0) {
    console.error(`❌ EDP 表有 ${orphanEDPs} 条孤儿记录（employeeId 不存在）`);
    exitCode = 1;
  } else {
    console.log("✅ EDP 外键完整性正常");
  }

  db.close();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
