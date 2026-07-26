import type {
  ContractLifecycleStatus,
  ContractPerformanceStatus,
  ContractSignatureStatus,
  ContractStateAxis,
} from "@workspace/administration/types";

export const CONTRACT_STATE_OPTIONS_BY_AXIS = {
  lifecycle: ["draft", "active", "terminated", "expired", "closed", "unknown"],
  signature: ["unknown", "unsigned", "signed"],
  performance: ["unknown", "not_started", "in_progress", "fulfilled", "breached", "waived"],
} as const satisfies Record<ContractStateAxis, readonly string[]>;

const TRANSITIONS: Record<ContractStateAxis, Readonly<Record<string, readonly string[]>>> = {
  lifecycle: {
    draft: ["active", "closed"],
    active: ["terminated", "expired", "closed"],
    terminated: ["closed"],
    expired: ["closed"],
    closed: [],
    unknown: ["draft", "active", "terminated", "expired", "closed"],
  },
  signature: {
    unknown: ["unsigned", "signed"],
    unsigned: ["signed"],
    signed: [],
  },
  performance: {
    unknown: ["not_started", "in_progress", "fulfilled", "breached", "waived"],
    not_started: ["in_progress", "waived"],
    in_progress: ["fulfilled", "breached", "waived"],
    breached: ["fulfilled", "waived"],
    fulfilled: [],
    waived: [],
  },
};

export type ContractStateByAxis = {
  lifecycle: ContractLifecycleStatus;
  signature: ContractSignatureStatus;
  performance: ContractPerformanceStatus;
};

export function contractStateValueIsValid(axis: ContractStateAxis, value: string) {
  return (CONTRACT_STATE_OPTIONS_BY_AXIS[axis] as readonly string[]).includes(value);
}

export function allowedContractStateTransitions(axis: ContractStateAxis, fromState: string) {
  return TRANSITIONS[axis][fromState] ?? [];
}

export function validateContractStateTransition(axis: ContractStateAxis, fromState: string, toState: string) {
  if (!contractStateValueIsValid(axis, fromState) || !contractStateValueIsValid(axis, toState)) {
    return { ok: false as const, error: "合同状态值无效" };
  }
  if (fromState === toState) return { ok: false as const, error: "目标状态与当前状态相同" };
  if (!allowedContractStateTransitions(axis, fromState).includes(toState)) {
    return { ok: false as const, error: `不允许从 ${fromState} 变更为 ${toState}` };
  }
  return { ok: true as const };
}

export function contractStateValue(
  contract: { lifecycleStatus: string; signatureStatus: string; performanceStatus: string },
  axis: ContractStateAxis,
) {
  if (axis === "lifecycle") return contract.lifecycleStatus;
  if (axis === "signature") return contract.signatureStatus;
  return contract.performanceStatus;
}

export function contractStateProjection(axis: ContractStateAxis, value: string) {
  if (axis === "lifecycle") return { lifecycleStatus: value };
  if (axis === "signature") return { signatureStatus: value };
  return { performanceStatus: value };
}

export function previousBusinessDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function canHardDeleteContractFacts(input: {
  lifecycleStatus: string;
  isArchived: boolean;
  currentRevisionId: number | null;
  approvalSourceKey: string | null;
  attachmentCount: number;
  recordCount: number;
  stateEventCount: number;
  revisionStates: readonly string[];
}) {
  return input.lifecycleStatus === "draft"
    && !input.isArchived
    && input.currentRevisionId === null
    && input.approvalSourceKey === null
    && input.attachmentCount === 0
    && input.recordCount === 0
    && input.stateEventCount === 0
    && input.revisionStates.length > 0
    && input.revisionStates.every((state) => state === "draft");
}
