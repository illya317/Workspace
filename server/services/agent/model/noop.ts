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
  {
    patterns: [/^查\S+/, /查.*员工/, /搜.*员工/, /.*信息$/, /找.*人/, /员工.*查/, /^[a-z]{2,4}$/],
    tool: "hr.searchEmployees",
    extractParams: (input) => {
      // 提取可能的姓名/关键词：去掉"查""员工""信息"等
      // 提取关键词：去掉"查""查询""员工""信息"等前缀后缀
      const kw = input.replace(/^查(询|找|一下)?\s*/g, "")
        .replace(/查询|搜索|查找|员工|信息|的资料|给我|帮我|一下|的$|是谁/g, "").trim();
      // 纯拼音首字母直接当关键词
      return { keyword: kw || input.trim() };
    },
  },
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
