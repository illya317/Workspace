export type AgentActorUserField = "canLogin" | "username" | "employeeId";

export function validateAgentActorUserFieldChange(input: {
  profileKey: string | null;
  field: AgentActorUserField;
  value: unknown;
}) {
  if (!input.profileKey) return null;
  if (input.field === "canLogin" && input.value === false) return null;
  if (input.field === "canLogin") {
    return `Agent 执行账号 ${input.profileKey} 必须保持禁止登录`;
  }
  return `Agent 执行账号 ${input.profileKey} 的身份绑定只能通过 Agent provisioning 管理`;
}
