/**
 * Finance 相关 Agent 工具。
 * 不搬业务逻辑，只做权限校验 + 调用领域 service。
 */
import type { AgentTool } from "@workspace/platform/server/agent/tools";
import type { StatementReportType } from "@workspace/finance/types";

import {
  type DeptBudgetItem,
  type RdBudgetItem,
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
  readDeptBudget,
  readRdBudget,
} from "./budget/budget-data";
import { getActiveVersion } from "./budget/budget-version";
import {
  loadConsolidatedStatementPageData,
  loadStandaloneStatementPageData,
  StatementPageDataError,
  type StatementPageData,
} from "./statements/statement-page-data";
import {
  configureOperationalAnalysisTemplateTool,
  financeOperationalAnalysisProposalExecutors,
} from "./cost/operational-analysis-agent-tool";
import {
  discoverOperationalAnalysisSourcesTool,
  readOperationalAnalysisWorkspaceTool,
} from "./cost/operational-analysis-agent-read-tools";

export { financeOperationalAnalysisProposalExecutors };

type BudgetToolItem = DeptBudgetItem | RdBudgetItem;

export const queryBudgetTool: AgentTool = {
  key: "finance.queryBudget",
  label: "查询预算",
  description: "查询年度预算数据（部门预算或研发预算）",
  requiredPermissions: [{ resourceKey: "finance.budget", action: "read" }],
  mutates: false,

  async execute(params: Record<string, unknown>) {
    const year = typeof params.year === "number" ? params.year
      : typeof params.year === "string" ? parseInt(params.year)
      : new Date().getFullYear();
    const type = typeof params.type === "string" ? params.type : "dept";

    const active = await getActiveVersion(year);
    const label = type === "rd" ? "研发预算" : "部门预算";

    let raw: BudgetToolItem[];
    if (active) {
      // 优先用 DB 中已导入/激活的版本数据
      raw = type === "rd"
        ? await loadRdBudgetFromDb(active.id)
        : await loadDeptBudgetFromDb(active.id);
    } else {
      // 无激活版本时回退到 seed Excel
      raw = type === "rd" ? readRdBudget() : readDeptBudget();
    }

    const items = raw.slice(0, 20).map((r) => {
      if (type === "rd") {
        const item = r as RdBudgetItem;
        return { project: item.project, category: item.category, total: item.total, months: item.months };
      }
      const item = r as DeptBudgetItem;
      return { dept: item.dept, account: item.account, total: item.total, months: item.months, expenseType: item.expenseType };
    });

    return {
      type: "data",
      message: `${year}年${label}${active ? `（版本：${active.name}）` : "（seed 数据）"}，共 ${items.length} 条记录`,
      data: { version: active ? { id: active.id, name: active.name, status: active.status, year } : null, type, items },
    };
  },
};

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function requestedReportType(value: unknown): StatementReportType | null {
  if (value === "balance" || value === "balanceSheet") return "balanceSheet";
  if (value === "income" || value === "incomeStatement") return "incomeStatement";
  if (value === "cashflow" || value === "cashFlow") return "cashFlow";
  return null;
}

function statementModelContext(data: StatementPageData, reportType: StatementReportType | null) {
  const statements = reportType
    ? data.statements.filter((statement) => statement.reportType === reportType)
    : data.statements;
  return {
    source: "finance-statements-page",
    scope: data.scope,
    statements: statements.map((statement) => ({
      reportType: statement.reportType,
      label: statement.label,
      source: statement.source,
      diagnostics: statement.diagnostics,
      totals: statement.totals,
      lines: statement.lines.map((line) => ({
        lineCode: line.lineCode,
        label: line.label,
        amount: line.amount,
        previousAmount: line.previousAmount,
        isTotal: line.isTotal,
        isGrandTotal: line.isGrandTotal,
      })),
    })),
  };
}

export const readStatementsPageTool: AgentTool = {
  key: "finance.readStatementsPage",
  label: "读取当前财务报表页面",
  description: "读取 /finance/statements 当前页面所选公司与期间，或所选合并批次的实时三表和校验数据。财务报表页的读数、比较、平衡检查和财务判断必须优先使用本工具；不得用资料库文档替代当前页面数据。",
  parameters: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["standalone", "consolidated"], description: "当前页面模式：财务报表或合并报表" },
      companyCode: { type: "string", description: "单体财务报表当前公司编码" },
      year: { type: "integer", minimum: 2000, maximum: 2099 },
      month: { type: "integer", minimum: 1, maximum: 12 },
      batchId: { type: "integer", minimum: 1, description: "合并报表当前批次 ID" },
      reportType: { type: "string", enum: ["balanceSheet", "incomeStatement", "cashFlow"], description: "可选；只读取当前选中的一张报表" },
    },
    required: ["mode"],
    additionalProperties: false,
  },
  examples: [
    {
      user: "判断当前合并报表有没有异常",
      arguments: { mode: "consolidated", batchId: 1 },
    },
  ],
  requiredPermissions: [{ resourceKey: "finance.statements", action: "read" }],
  mutates: false,

  async execute(params: Record<string, unknown>) {
    try {
      const reportType = requestedReportType(params.reportType);
      let data: StatementPageData;
      if (params.mode === "standalone") {
        const companyCode = typeof params.companyCode === "string" ? params.companyCode.trim() : "";
        const year = positiveInteger(params.year);
        const month = positiveInteger(params.month);
        if (!companyCode || year === null || month === null || month > 12) {
          return { type: "error", message: "读取单体财务报表需要当前页面的公司编码、年份和月份" };
        }
        data = await loadStandaloneStatementPageData({ companyCode, year, month });
      } else if (params.mode === "consolidated") {
        const batchId = positiveInteger(params.batchId);
        if (batchId === null) return { type: "error", message: "读取合并报表需要当前页面的合并批次 ID" };
        data = await loadConsolidatedStatementPageData(batchId);
      } else {
        return { type: "error", message: "mode 必须是 standalone 或 consolidated" };
      }
      const modelContext = statementModelContext(data, reportType);
      return {
        type: "data",
        message: `已从当前财务报表页面读取 ${data.scope.companyName} ${data.scope.year}年${data.scope.month}月${reportType ? "当前报表" : "三张报表"}`,
        data,
        modelContext,
      };
    } catch (cause) {
      const message = cause instanceof StatementPageDataError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : "当前财务报表页面读取失败";
      return { type: "error", message };
    }
  },
};

export const financeAgentTools: AgentTool[] = [
  queryBudgetTool,
  readStatementsPageTool,
  readOperationalAnalysisWorkspaceTool,
  discoverOperationalAnalysisSourcesTool,
  configureOperationalAnalysisTemplateTool,
];
