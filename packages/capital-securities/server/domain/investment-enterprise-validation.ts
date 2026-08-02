import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

const PROFILE_STATUSES = ["pipeline", "active", "watch", "exiting", "exited"] as const;
const RECORD_KINDS = ["meeting", "diligence", "contract", "monitoring"] as const;
const MEETING_TYPES = ["shareholders", "board", "supervisors", "special"] as const;
const MEETING_STATUSES = ["planned", "held", "closed"] as const;
const DILIGENCE_WORKSTREAMS = ["business", "financial", "legal", "tax", "technology", "hr", "esg", "compliance"] as const;
const DILIGENCE_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const DILIGENCE_STATUSES = ["open", "mitigating", "accepted", "closed"] as const;
const REMEDIATION_STATUSES = ["not_started", "in_progress", "verified"] as const;
const CONTRACT_TYPES = ["investment_agreement", "shareholders_agreement", "articles", "side_letter", "loan_security", "other"] as const;
const CONTRACT_STATUSES = ["draft", "effective", "expiring", "expired", "terminated"] as const;
const MONITORING_STATUSES = ["draft", "confirmed"] as const;
const ANALYZABLE_FILE_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "png", "jpg", "jpeg", "tif", "tiff", "webp", "txt", "md"]);

function text(value: unknown, max = 500) {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function requiredText(value: unknown, label: string, max = 240) {
  const normalized = text(value, max);
  return normalized ? okCommand(normalized) : failCommand(`请填写${label}`);
}

function positiveId(value: unknown, label: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? okCommand(id) : failCommand(`${label}无效`);
}

function version(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? okCommand(parsed) : failCommand("版本无效，请刷新后重试", 400, "version");
}

function choice<const T extends readonly string[]>(value: unknown, allowed: T, label: string, fallback: T[number]) {
  const normalized = String(value ?? fallback);
  return allowed.includes(normalized as T[number]) ? okCommand(normalized as T[number]) : failCommand(`${label}无效`);
}

function date(value: unknown, label: string, required = false) {
  const normalized = text(value, 10);
  if (!normalized) return required ? failCommand(`请填写${label}`) : okCommand(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return failCommand(`${label}格式无效`);
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized ? failCommand(`${label}无效`) : okCommand(parsed);
}

function decimal(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e15 ? okCommand(parsed.toFixed(2)) : failCommand(`${label}无效`);
}

function integer(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? okCommand(parsed) : failCommand(`${label}无效`);
}

function profileData(body: Record<string, unknown>) {
  const portfolioCode = requiredText(body.portfolioCode, "投资编号", 80);
  if (!portfolioCode.ok) return portfolioCode;
  const status = choice(body.investmentStatus, PROFILE_STATUSES, "投资状态", "active"); if (!status.ok) return status;
  const investmentDate = date(body.investmentDate, "投资日期"); if (!investmentDate.ok) return investmentDate;
  const exitDate = date(body.exitDate, "退出日期"); if (!exitDate.ok) return exitDate;
  const valuationDate = date(body.valuationDate, "估值日期"); if (!valuationDate.ok) return valuationDate;
  const nextReviewDate = date(body.nextReviewDate, "下次复盘日期"); if (!nextReviewDate.ok) return nextReviewDate;
  const investedAmount = decimal(body.investedAmount, "累计投资金额"); if (!investedAmount.ok) return investedAmount;
  const currentValuation = decimal(body.currentValuation, "当前估值"); if (!currentValuation.ok) return currentValuation;
  return okCommand({
    portfolioCode: portfolioCode.data,
    investmentStatus: status.data,
    investmentStage: text(body.investmentStage, 80),
    industry: text(body.industry, 120),
    investmentDate: investmentDate.data,
    exitDate: exitDate.data,
    investmentCurrency: text(body.investmentCurrency, 12) ?? "CNY",
    investedAmount: investedAmount.data,
    currentValuation: currentValuation.data,
    valuationDate: valuationDate.data,
    investmentLead: text(body.investmentLead, 120),
    dealTeam: text(body.dealTeam, 500),
    boardSeat: text(body.boardSeat, 240),
    investmentThesis: text(body.investmentThesis, 5000),
    keyRisks: text(body.keyRisks, 5000),
    exitPlan: text(body.exitPlan, 5000),
    nextReviewDate: nextReviewDate.data,
  });
}

export async function buildInvestmentEnterpriseCreateCommand(body: Record<string, unknown>) {
  const companyId = positiveId(body.companyId, "公司"); if (!companyId.ok) return companyId;
  const data = profileData(body);
  return data.ok ? okCommand({ companyId: companyId.data, data: data.data }) : data;
}

export async function buildInvestmentEnterpriseUpdateCommand(body: Record<string, unknown>) {
  const id = positiveId(body.id, "投资企业档案"); if (!id.ok) return id;
  const expectedVersion = version(body.version); if (!expectedVersion.ok) return expectedVersion;
  const data = profileData(body);
  return data.ok ? okCommand({ id: id.data, version: expectedVersion.data, data: data.data }) : data;
}

export function buildInvestmentEnterpriseRecordCommand(body: Record<string, unknown>) {
  const kind = String(body.kind ?? "");
  if (!RECORD_KINDS.includes(kind as typeof RECORD_KINDS[number])) return failCommand("记录类型无效");
  const profileId = positiveId(body.profileId, "投资企业档案"); if (!profileId.ok) return profileId;
  const id = body.id === undefined ? okCommand(null) : positiveId(body.id, "记录"); if (!id.ok) return id;
  const expectedVersion = id.data === null ? okCommand(null) : version(body.version); if (!expectedVersion.ok) return expectedVersion;
  const title = kind === "monitoring" ? okCommand("") : requiredText(body.title, "标题"); if (!title.ok) return title;
  if (kind === "meeting") {
    const meetingType = choice(body.meetingType, MEETING_TYPES, "会议类型", "shareholders"); if (!meetingType.ok) return meetingType;
    const status = choice(body.status, MEETING_STATUSES, "会议状态", "planned"); if (!status.ok) return status;
    const meetingDate = date(body.meetingDate, "会议日期"); if (!meetingDate.ok) return meetingDate;
    const followUpDueDate = date(body.followUpDueDate, "跟进期限"); if (!followUpDueDate.ok) return followUpDueDate;
    return okCommand({ kind: "meeting" as const, profileId: profileId.data, id: id.data, version: expectedVersion.data, data: {
      meetingType: meetingType.data, title: title.data, meetingDate: meetingDate.data,
      status: status.data, decisionSummary: text(body.decisionSummary, 5000), votingResult: text(body.votingResult, 1000),
      followUpOwner: text(body.followUpOwner, 120), followUpDueDate: followUpDueDate.data, notes: text(body.notes, 5000), sourceReference: text(body.sourceReference, 500),
    }});
  }
  if (kind === "diligence") {
    const workstream = choice(body.workstream, DILIGENCE_WORKSTREAMS, "尽调领域", "legal"); if (!workstream.ok) return workstream;
    const riskLevel = choice(body.riskLevel, DILIGENCE_RISK_LEVELS, "风险等级", "medium"); if (!riskLevel.ok) return riskLevel;
    const status = choice(body.status, DILIGENCE_STATUSES, "问题状态", "open"); if (!status.ok) return status;
    const remediationStatus = choice(body.remediationStatus, REMEDIATION_STATUSES, "整改进度", "not_started"); if (!remediationStatus.ok) return remediationStatus;
    const dueDate = date(body.dueDate, "整改期限"); if (!dueDate.ok) return dueDate;
    return okCommand({ kind: "diligence" as const, profileId: profileId.data, id: id.data, version: expectedVersion.data, data: {
      workstream: workstream.data, title: title.data, riskLevel: riskLevel.data, status: status.data,
      finding: text(body.finding, 5000), recommendation: text(body.recommendation, 5000), ownerName: text(body.ownerName, 120), dueDate: dueDate.data,
      remediationStatus: remediationStatus.data, remediationEvidence: text(body.remediationEvidence, 5000), sourceReference: text(body.sourceReference, 500),
    }});
  }
  if (kind === "contract") {
    const contractType = choice(body.contractType, CONTRACT_TYPES, "合同类型", "investment_agreement"); if (!contractType.ok) return contractType;
    const status = choice(body.status, CONTRACT_STATUSES, "合同状态", "draft"); if (!status.ok) return status;
    const signedDate = date(body.signedDate, "签署日期"); if (!signedDate.ok) return signedDate;
    const effectiveDate = date(body.effectiveDate, "生效日期"); if (!effectiveDate.ok) return effectiveDate;
    const expiryDate = date(body.expiryDate, "到期日期"); if (!expiryDate.ok) return expiryDate;
    const noticeDate = date(body.noticeDate, "提醒日期"); if (!noticeDate.ok) return noticeDate;
    const amount = decimal(body.amount, "合同金额"); if (!amount.ok) return amount;
    return okCommand({ kind: "contract" as const, profileId: profileId.data, id: id.data, version: expectedVersion.data, data: {
      contractType: contractType.data, title: title.data, counterpartyText: text(body.counterpartyText, 240), signedDate: signedDate.data,
      effectiveDate: effectiveDate.data, expiryDate: expiryDate.data, noticeDate: noticeDate.data, status: status.data,
      currency: text(body.currency, 12) ?? "CNY", amount: amount.data, keyTerms: text(body.keyTerms, 5000), obligationSummary: text(body.obligationSummary, 5000), sourceReference: text(body.sourceReference, 500),
    }});
  }
  const status = choice(body.status, MONITORING_STATUSES, "监控状态", "draft"); if (!status.ok) return status;
  const periodEnd = date(body.periodEnd, "报告期", true); if (!periodEnd.ok) return periodEnd;
  const revenue = decimal(body.revenue, "营业收入"); if (!revenue.ok) return revenue;
  const netProfit = decimal(body.netProfit, "净利润"); if (!netProfit.ok) return netProfit;
  const cashBalance = decimal(body.cashBalance, "现金余额"); if (!cashBalance.ok) return cashBalance;
  const valuation = decimal(body.valuation, "估值"); if (!valuation.ok) return valuation;
  const headcount = integer(body.headcount, "人数"); if (!headcount.ok) return headcount;
  return okCommand({ kind: "monitoring" as const, profileId: profileId.data, id: id.data, version: expectedVersion.data, data: {
    periodEnd: periodEnd.data!, status: status.data, currency: text(body.currency, 12) ?? "CNY",
    revenue: revenue.data, netProfit: netProfit.data, cashBalance: cashBalance.data, valuation: valuation.data, headcount: headcount.data,
    highlights: text(body.highlights, 5000), risks: text(body.risks, 5000), sourceReference: text(body.sourceReference, 500),
  }});
}

export async function buildInvestmentDocumentUploadCommand(input: {
  profileId: unknown; documentCategory: unknown; title: unknown; notes: unknown; file: File;
}) {
  const profileId = positiveId(input.profileId, "投资企业档案"); if (!profileId.ok) return profileId;
  const category = requiredText(input.documentCategory, "资料分类", 80); if (!category.ok) return category;
  const title = requiredText(input.title, "资料标题"); if (!title.ok) return title;
  if (!input.file.name || input.file.size <= 0 || input.file.size > 20 * 1024 * 1024) return failCommand("文件必须大于 0 且不超过 20 MB", 400, "file");
  const extension = input.file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
  if (!ANALYZABLE_FILE_EXTENSIONS.has(extension)) return failCommand("仅支持 PDF、Office、文本和常见图片文件", 400, "file");
  return okCommand({ profileId: profileId.data, documentCategory: category.data, title: title.data, notes: text(input.notes, 2000), file: input.file });
}

export async function buildInvestmentDocumentSearchCommand(input: { profileId: unknown; query: unknown; limit: unknown }) {
  const profileId = positiveId(input.profileId, "投资企业档案"); if (!profileId.ok) return profileId;
  const query = requiredText(input.query, "检索问题", 500); if (!query.ok) return query;
  if (query.data.length < 2) return failCommand("检索问题至少需要 2 个字符");
  const limit = Number(input.limit ?? 12);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) return failCommand("检索数量无效");
  return okCommand({ profileId: profileId.data, query: query.data, limit });
}
