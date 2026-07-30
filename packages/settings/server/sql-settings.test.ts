import assert from "node:assert/strict";
import test from "node:test";

import { SQL_SETTINGS_DESKTOP_RATIO } from "../sql-settings-contract";
import { buildSqlSettingsCatalog, type SqlConnectionRow, type SqlSettingRow } from "./sql-settings";

const connection: SqlConnectionRow = {
  databaseName: "workspace",
  roleName: "workspace_runtime",
  serverVersion: "16.14",
  ssl: true,
  protocol: "TLSv1.3",
  cipher: "TLS_AES_256_GCM_SHA384",
};

function row(name: string, setting: string, overrides: Partial<SqlSettingRow> = {}): SqlSettingRow {
  return {
    name,
    setting,
    unit: null,
    source: "configuration file",
    context: "sighup",
    pendingRestart: false,
    ...overrides,
  };
}

test("SQL settings catalog groups safe runtime configuration for the 3:7 workbench", () => {
  const catalog = buildSqlSettingsCatalog(connection, [
    row("ssl", "on"),
    row("ssl_min_protocol_version", "TLSv1.2"),
    row("password_encryption", "scram-sha-256"),
    row("statement_timeout", "30000", { unit: "ms", source: "user" }),
    row("lock_timeout", "5000", { unit: "ms", source: "user" }),
    row("idle_in_transaction_session_timeout", "60000", { unit: "ms", source: "user" }),
    row("idle_session_timeout", "600000", { unit: "ms", source: "user" }),
    row("log_connections", "on"),
    row("log_disconnections", "on"),
    row("log_lock_waits", "on"),
    row("log_statement", "none"),
    row("wal_level", "replica"),
    row("archive_mode", "off"),
    row("full_page_writes", "on"),
  ], "2026-07-31T00:00:00.000Z");

  assert.deepEqual(catalog.groups.map((group) => group.key), ["connection", "session", "audit", "recovery"]);
  assert.deepEqual(SQL_SETTINGS_DESKTOP_RATIO, [3, 7]);
  assert.equal(catalog.transport.protocol, "TLSv1.3");
  assert.equal(catalog.groups[0]?.items.find((item) => item.key === "password_encryption")?.status, "aligned");
  assert.equal(catalog.groups[1]?.items.find((item) => item.key === "statement_timeout")?.source, "user");
  assert.equal(catalog.groups[3]?.items.find((item) => item.key === "archive_mode")?.status, "informational");
});

test("unlimited settings require review while privilege-hidden settings stay explicit", () => {
  const catalog = buildSqlSettingsCatalog(connection, [row("statement_timeout", "0")]);
  const session = catalog.groups.find((group) => group.key === "session");
  const connectionGroup = catalog.groups.find((group) => group.key === "connection");

  assert.equal(session?.items.find((item) => item.key === "statement_timeout")?.status, "review");
  assert.equal(connectionGroup?.items.find((item) => item.key === "ssl")?.currentValue, "运行角色无权读取");
  assert.equal(connectionGroup?.items.find((item) => item.key === "ssl")?.status, "informational");
});
