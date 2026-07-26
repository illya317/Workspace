import { Info } from "lucide-react";
import type { FormSurfaceItemSpec } from "@workspace/core/ui";
import type { WorkflowPolicyDraft, WorkflowPolicyRow } from "./WorkflowPoliciesTabModel";

export const BOOLEAN_POLICY_ITEMS = [
  ["requestCanWithdraw", "请求可撤回", "提交后、处理前，发起人可撤回请求；是否可修改由请求可修订单独决定。"],
  ["requestCanRevise", "请求可修订", "发起人可修改草稿、已撤回或被驳回请求；不要求业务资料的修订权限。"],
  ["requestCanCancel", "请求可删除", "处理前，发起人可删除请求；不要求业务删除权限。"],
  ["requestCanResubmit", "请求可重发", "被驳回后，发起人可在同一流程记录中重新提交。"],
] as const;

type BooleanPolicyKey = typeof BOOLEAN_POLICY_ITEMS[number][0];

export function booleanChoiceField(input: {
  key: BooleanPolicyKey;
  label: string;
  help: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): FormSurfaceItemSpec {
  return {
    key: input.key,
    label: (
      <span className="inline-flex items-center gap-1">
        {input.label}
        <InfoLabel ariaLabel={`${input.label}：${input.help}`} title={input.help} />
      </span>
    ),
    spec: {
      valueType: "string",
      control: "choice",
      options: { source: "static", items: [{ value: "true", label: "是" }, { value: "false", label: "否" }] },
    },
    value: input.value ? "true" : "false",
    onChange: (value) => input.onChange(value === "true"),
  };
}

export function requestControlSummary(
  policy: Pick<WorkflowPolicyRow | WorkflowPolicyDraft, "requestCanWithdraw" | "requestCanResubmit" | "requestCanCancel" | "requestCanRevise">,
) {
  const labels = [
    policy.requestCanWithdraw ? "可撤回" : null,
    policy.requestCanRevise ? "可修订" : null,
    policy.requestCanCancel ? "可删除" : null,
    policy.requestCanResubmit ? "可重发" : null,
  ].filter(Boolean);
  return labels.length > 0 ? `请求：${labels.join("/")}` : "请求：无自助操作";
}

export function InfoLabel({ ariaLabel, title }: { ariaLabel: string; title: string }) {
  return (
    <span aria-label={ariaLabel} className="inline-flex text-slate-400" tabIndex={0} title={title}>
      <Info size={15} strokeWidth={1.9} />
    </span>
  );
}
