import assert from "node:assert/strict";
import test from "node:test";

import {
  SQL_RUNTIME_SETTING_OPTIONS,
  SqlSettingOperationValidationError,
  validateSqlSettingOperation,
} from "./sql-settings-operation-validation";

test("runtime SQL settings accept only the declared setting and option allowlists", () => {
  assert.equal(SQL_RUNTIME_SETTING_OPTIONS.lock_timeout.some((option) => option.value === "10s"), true);
  assert.deepEqual(validateSqlSettingOperation({
    operation: "set-runtime-setting",
    settingKey: "lock_timeout",
    value: "10s",
    expectedCurrentValueMs: 5000,
    reason: "降低锁等待风险",
  }), {
    operation: "set-runtime-setting",
    settingKey: "lock_timeout",
    value: "10s",
    expectedCurrentValueMs: 5000,
    reason: "降低锁等待风险",
  });

  assert.throws(() => validateSqlSettingOperation({
    operation: "set-runtime-setting",
    settingKey: "log_statement",
    value: "all",
    expectedCurrentValueMs: 1000,
    reason: "尝试记录所有语句",
  }), SqlSettingOperationValidationError);
});

test("password rotation carries no password and requires the exact confirmation", () => {
  assert.deepEqual(validateSqlSettingOperation({
    operation: "rotate-runtime-password",
    reason: "季度凭据轮换",
    confirmation: "ROTATE",
  }), {
    operation: "rotate-runtime-password",
    reason: "季度凭据轮换",
  });

  assert.throws(() => validateSqlSettingOperation({
    operation: "rotate-runtime-password",
    reason: "季度凭据轮换",
    confirmation: "yes",
  }), SqlSettingOperationValidationError);
});
