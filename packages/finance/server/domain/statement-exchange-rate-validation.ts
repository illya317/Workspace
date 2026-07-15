import type { StatementExchangeRateInput } from "@workspace/finance/types";
import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export interface SaveStatementExchangeRateCommand {
  input: StatementExchangeRateInput;
  userId: number;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildSaveStatementExchangeRateCommand(
  raw: StatementExchangeRateInput,
  userId: number,
) {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("当前用户无效", 401);
  if (raw.baseCurrency !== "CAD" || raw.quoteCurrency !== "CNY") {
    return failCommand("当前合并底稿仅接受 CAD/CNY 汇率", 400, "baseCurrency");
  }
  if (!["closing", "historicalInvestment"].includes(raw.rateKind)) {
    return failCommand("汇率口径无效", 400, "rateKind");
  }
  if (!validDate(raw.rateDate)) return failCommand("牌价日期无效", 400, "rateDate");
  if (!Number.isFinite(raw.rate) || raw.rate <= 0 || raw.rate > 100000) {
    return failCommand("中行折算价必须为正数", 400, "rate");
  }
  if (raw.status !== "draft") {
    return failCommand("汇率录入只能保存草稿，复核必须由另一名人员执行", 409, "status");
  }
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(raw.sourceUrl);
  } catch {
    return failCommand("汇率来源网址无效", 400, "sourceUrl");
  }
  if (sourceUrl.protocol !== "https:" || !/(^|\.)boc\.cn$/i.test(sourceUrl.hostname)) {
    return failCommand("汇率来源必须为中国银行 boc.cn 的 HTTPS 页面", 400, "sourceUrl");
  }
  const publishedText = normalizeOptionalText(raw.publishedAt);
  const publishedAt = publishedText ? new Date(publishedText) : null;
  if (publishedText && Number.isNaN(publishedAt?.getTime())) {
    return failCommand("牌价发布时间无效", 400, "publishedAt");
  }
  return okCommand<SaveStatementExchangeRateCommand>({
    userId,
    input: {
      ...raw,
      sourceUrl: sourceUrl.toString(),
      publishedAt: publishedAt?.toISOString() ?? null,
      note: normalizeOptionalText(raw.note),
    },
  });
}
