import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export function buildWriteTemplateFeedbackStoreCommand(store: unknown): DomainValidationResult<unknown> {
  if (!store || typeof store !== "object" || Array.isArray(store)) return failCommand("反馈存储必须是对象");
  const items = (store as { items?: unknown }).items;
  if (!Array.isArray(items)) return failCommand("反馈存储 items 必须是数组");
  return okCommand(store);
}
