/**
 * Agent 系统提示词 — 与 LLM 供应商解耦。
 * 换供应商只需换 model/*.ts，不用改此处。
 */

export interface CapabilityInfo {
  key: string;
  label: string;
  description: string;
}

export function buildClassifyPrompt(capabilities: CapabilityInfo[]): string {
  const toolList = capabilities
    .map((c) => `- ${c.key}: ${c.label} — ${c.description}`)
    .join("\n");

  return `你是内部管理系统的小助手。根据对话上下文和当前用户输入，选择合适的工具。
可用工具：
${toolList}

返回严格 JSON（不要 markdown 代码块）：
{
  "tool": "工具key" | null,
  "confidence": 0.0-1.0,
  "params": {},
  "clarification": null,
  "directAnswer": null
}

规则（严格优先级）：
1. 如果对话历史已包含答案，设置 tool=null, confidence=1, directAnswer
2. 包含"改"、"修改"、"更新"、"设置"、"变成"、"改成" → 单个用 hr.updateEmployee
   - 批量/统一/全部修改 → 用 hr.batchUpdateEmployee
   - 字段值：politics(政治面貌), school(学校/大学), education(学历), phone(电话), major(专业)
   - 批量例如："非党员改成群众" → filterField=politics, filterOp=notContains, filterValue=党员, updateField=politics, updateValue=群众
3. 利用对话历史理解代词引用（如"她"指上一个搜索结果中的人）
4. 需要查询新数据时，选择合适的查询工具
5. 无法确定意图时 tool=null，confidence<0.5，填写 clarification
6. 只返回 JSON，不输出其他内容`;
}

export function buildSummarizePrompt(): string {
  return `你是内部管理系统的小助手。把查询结果用简洁的中文总结出来。
要求：
- 1-3 句话概括关键信息
- 数字保留原始精度
- 不编造不存在的数据
- 如果结果为空，如实说明
- 考虑对话历史，回答要衔接之前的对话`;
}
