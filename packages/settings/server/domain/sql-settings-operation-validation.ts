import type { SqlSettingOperationInput } from "../../sql-settings-contract";

export const SQL_RUNTIME_SETTING_OPTIONS = {
  statement_timeout: [
    { value: "30s", label: "30 秒" },
    { value: "60s", label: "1 分钟" },
    { value: "120s", label: "2 分钟" },
    { value: "300s", label: "5 分钟" },
    { value: "900s", label: "15 分钟" },
  ],
  lock_timeout: [
    { value: "5s", label: "5 秒" },
    { value: "10s", label: "10 秒" },
    { value: "15s", label: "15 秒" },
    { value: "30s", label: "30 秒" },
  ],
  idle_in_transaction_session_timeout: [
    { value: "30s", label: "30 秒" },
    { value: "60s", label: "1 分钟" },
    { value: "120s", label: "2 分钟" },
    { value: "300s", label: "5 分钟" },
  ],
} as const;

export type SqlRuntimeSettingKey = keyof typeof SQL_RUNTIME_SETTING_OPTIONS;

export class SqlSettingOperationValidationError extends Error {}

function normalizedReason(reason: string) {
  const value = reason.trim();
  if (value.length < 4 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SqlSettingOperationValidationError("变更原因无效");
  }
  return value;
}

export type ValidatedSqlSettingOperation =
  | {
      operation: "set-runtime-setting";
      settingKey: SqlRuntimeSettingKey;
      value: string;
      expectedCurrentValueMs: number;
      reason: string;
    }
  | {
      operation: "rotate-runtime-password";
      reason: string;
    };

export function validateSqlSettingOperation(input: SqlSettingOperationInput): ValidatedSqlSettingOperation {
  const reason = normalizedReason(input.reason);
  if (input.operation === "rotate-runtime-password") {
    if (input.confirmation !== "ROTATE") {
      throw new SqlSettingOperationValidationError("请输入 ROTATE 确认密码轮换");
    }
    return { operation: input.operation, reason };
  }

  if (!Object.hasOwn(SQL_RUNTIME_SETTING_OPTIONS, input.settingKey)) {
    throw new SqlSettingOperationValidationError("该 SQL 设置不允许在线修改");
  }
  const settingKey = input.settingKey as SqlRuntimeSettingKey;
  const options = SQL_RUNTIME_SETTING_OPTIONS[settingKey] as readonly { value: string; label: string }[];
  if (!options.some((option) => option.value === input.value)) {
    throw new SqlSettingOperationValidationError("SQL 设置值不在允许范围内");
  }
  if (!Number.isInteger(input.expectedCurrentValueMs) || input.expectedCurrentValueMs <= 0 || input.expectedCurrentValueMs > 86_400_000) {
    throw new SqlSettingOperationValidationError("SQL 设置旧值无效");
  }
  return {
    operation: input.operation,
    settingKey,
    value: input.value,
    expectedCurrentValueMs: input.expectedCurrentValueMs,
    reason,
  };
}
