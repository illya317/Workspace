import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";

export const NOTIFICATION_DEFINITION_KEY_IMMUTABLE_MESSAGE = "通知定义创建后不能修改 key";

export function validateImmutableNotificationDefinitionKey(
  currentKey: string,
  nextKey: string,
): DomainValidationResult<true> {
  return currentKey === nextKey
    ? okCommand(true)
    : failCommand(NOTIFICATION_DEFINITION_KEY_IMMUTABLE_MESSAGE, 409, "key");
}
