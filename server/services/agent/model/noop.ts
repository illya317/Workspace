/**
 * Noop/Rule-based provider — 不依赖 LLM，纯规则匹配。
 * 作为 MiniMax 不可用时的 fallback。
 */
import type { AgentModelProvider, SummarizeInput } from "./provider";

/** 简单关键词匹配 */
const KEYWORD_RULES: Array<{
  patterns: RegExp[];
  tool: string;
  extractParams: (input: string) => Record<string, unknown>;
}> = [
  // 写入必须在最前面，优先于查询
  {
    patterns: [/改.*学校|改.*学历|改.*电话|修改.*员工|更新.*员工|改成|设置.*员工/],
    tool: "hr.updateEmployee",
    extractParams: (input) => {
      // 提取工号（从历史中，这里尽量提取）
      const idMatch = input.match(/00\d{3}/);
      const fieldMap: Record<string, string> = { 学校: "school", 学历: "education", 电话: "phone", 专业: "major", 别名: "alias", 籍贯: "hometown" };
      let field = "school";
      let newValue = "";
      for (const [cn, key] of Object.entries(fieldMap)) {
        if (input.includes(cn)) { field = key; break; }
      }
      // 尝试提取新值（"改成XXX"）
      const valMatch = input.match(/改成\s*(\S+)/);
      if (valMatch) newValue = valMatch[1];
      return { employeeId: idMatch ? idMatch[0] : "", field, newValue };
    },
  },
  // 预算必须在 HR 前面，否则"查预算"会被 ^查\S+ 误判为查员工
  {
    patterns: [/预算/, /budget/i, /费用/],
    tool: "finance.queryBudget",
    extractParams: (input) => {
      const yearMatch = input.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      const type = /研发/.test(input) ? "rd" : "dept";
      return { year, type };
    },
  },
  {
    patterns: [/^查\S+/, /查.*员工/, /搜.*员工/, /.*信息$/, /找.*人/, /员工.*查/, /^[a-z]{2,4}$/],
    tool: "hr.searchEmployees",
    extractParams: (input) => {
      const kw = input.replace(/^查(询|找|一下)?\s*/g, "")
        .replace(/查询|搜索|查找|员工|信息|的资料|给我|帮我|一下|的$|是谁/g, "").trim();
      return { keyword: kw || input.trim() };
    },
  },
];

export const noopProvider: AgentModelProvider = {
  async classifyIntent(userMessage, capabilities) {
    const capKeys = new Set(capabilities.map((c) => c.key));

    for (const rule of KEYWORD_RULES) {
      if (!capKeys.has(rule.tool)) continue;
      for (const pattern of rule.patterns) {
        if (pattern.test(userMessage)) {
          return {
            tool: rule.tool,
            confidence: 0.7,
            params: rule.extractParams(userMessage),
          };
        }
      }
    }

    return {
      tool: null,
      confidence: 0,
      params: {},
      clarification: "抱歉，我没理解你的意思。你可以试试：查员工 [姓名]、查看预算",
    };
  },

  async summarizeResult(input: SummarizeInput) {
    return input.result && typeof input.result === "object" && "message" in input.result
      ? String((input.result as { message: string }).message)
      : `查询完成（工具：${input.toolLabel}）`;
  },
};
