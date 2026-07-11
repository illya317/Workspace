import "server-only";

import {
  resolveActionRuntime,
  workflowModeEnabled,
  type ActionRuntime,
  type ActionRuntimeRequestSnapshot,
} from "../workflow-action-runtime";
import type { ActionContractMetadata } from "../action-contract";
import { getActionContractMetadata } from "../action-contract-registry";
import {
  createPreparedApprovalDraft,
  submit,
  type ApprovalAdapter,
  type ApprovalOperation,
  type ApprovalPreparedPayload,
  type ApprovalRequestDto,
} from "./approvals";
import { resolveApprovalWorkflowPolicy } from "./approvals/workflow";
import { serviceError, serviceOk, type ServiceResult } from "./api";
import {
  resolveWorkflowPolicy,
  type WorkflowPolicyDefaults,
} from "./workflows";

type MaybePromise<T> = T | Promise<T>;

export type BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext> = {
  businessActionKey: string;
  validatorKey: string;
  commitKey: string;
  validate: (input: TInput, context: TContext) => MaybePromise<ServiceResult<TNormalized>>;
  commit: (input: TNormalized, context: TContext) => MaybePromise<ServiceResult<TResult>>;
};

export type BusinessActionProducerAdapter<TInput, TNormalized, TResult, TContext> = {
  businessActionKey: string;
  validatorKey?: string;
  executeKey: string;
  validate?: (input: TInput, context: TContext) => MaybePromise<ServiceResult<TNormalized>>;
  execute: (input: TNormalized, context: TContext) => MaybePromise<ServiceResult<TResult>>;
};

export type BusinessActionCommandWorkflow<TNormalized, TContext, TPayload> = {
  applicable?: boolean | ((input: TNormalized, context: TContext) => MaybePromise<boolean>);
  adapter: ApprovalAdapter<TPayload>;
  operation: ApprovalOperation;
  subjectId?: string | null | ((input: TNormalized, context: TContext) => MaybePromise<string | null | undefined>);
  prepare: (input: TNormalized, context: TContext) => MaybePromise<ApprovalPreparedPayload<TPayload>>;
  comment?: string | null;
};

export function defineBusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>(
  adapter: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>,
) {
  return adapter;
}

export function defineBusinessActionProducerAdapter<TInput, TNormalized, TResult, TContext>(
  adapter: BusinessActionProducerAdapter<TInput, TNormalized, TResult, TContext>,
) {
  return adapter;
}

export async function executeBusinessActionProducer<TInput, TNormalized, TResult, TContext>(input: {
  producer: BusinessActionProducerAdapter<TInput, TNormalized, TResult, TContext>;
  input: TInput;
  context: TContext;
  authorize?: (input: TNormalized, context: TContext) => MaybePromise<boolean>;
  forbiddenMessage?: string;
}): Promise<ServiceResult<TResult>> {
  const contract = getActionContractMetadata(input.producer.businessActionKey);
  if (!contract) return serviceError(`业务行为 ${input.producer.businessActionKey} 缺少 ActionContract`, 500);
  if (!("executeKey" in contract.domain) && !("bindings" in contract.domain)) {
    return serviceError(`业务行为 ${input.producer.businessActionKey} 不是 producer command`, 500);
  }
  const bindings = "bindings" in contract.domain && contract.domain.bindings
    ? contract.domain.bindings
    : [contract.domain];
  if (!bindings.some((binding) => (
    "executeKey" in binding
    && binding.validatorKey === input.producer.validatorKey
    && binding.executeKey === input.producer.executeKey
  ))) {
    return serviceError(`业务行为 ${input.producer.businessActionKey} 的 validator/producer 绑定与 ActionContract 不一致`, 500);
  }
  const normalized = input.producer.validate
    ? await input.producer.validate(input.input, input.context)
    : serviceOk(input.input as unknown as TNormalized);
  if (!normalized.ok) return normalized;
  if (input.authorize && !(await input.authorize(normalized.data, input.context))) {
    return serviceError(input.forbiddenMessage ?? "无权限执行该操作", 403);
  }
  return input.producer.execute(normalized.data, input.context);
}

export async function executeBusinessActionCommand<TInput, TNormalized, TResult, TContext, TPayload>(input: {
  command: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>;
  input: TInput;
  context: TContext;
  actorUserId: number;
  authorize?: (input: TNormalized, context: TContext) => MaybePromise<boolean>;
  forbiddenMessage?: string;
  workflow?: BusinessActionCommandWorkflow<TNormalized, TContext, TPayload>;
}): Promise<ServiceResult<BusinessActionMutationResult<TResult, TPayload>>> {
  const binding = validateCommandBinding(input.command);
  if (!binding.ok) return binding;
  const normalized = await input.command.validate(input.input, input.context);
  if (!normalized.ok) return normalized;
  const workflow = input.workflow;
  if (workflow && binding.data.workflow.kind === "not_applicable") {
    return serviceError("不可接流程的 ActionContract 不能绑定审批适配器", 500);
  }
  const workflowApplicable = workflow
    ? typeof workflow.applicable === "function"
      ? await workflow.applicable(normalized.data, input.context)
      : workflow.applicable !== false
    : false;

  if (binding.data.workflow.kind === "not_applicable" || !workflowApplicable || !workflow) {
    if (binding.data.workflow.kind !== "not_applicable" && !workflow) {
      const direct = await assertBusinessActionDirectExecutionAllowed({
        businessActionKey: input.command.businessActionKey,
        actorUserId: input.actorUserId,
        resourceKey: binding.data.resource.resourceKey,
        scopeType: "global",
      });
      if (!direct.ok) return direct;
    }
    return executeBoundDirectCommand(input.command, normalized.data, input.context, input.authorize, input.forbiddenMessage);
  }

  const preparedPayload = await workflow.prepare(normalized.data, input.context);
  const subjectId = typeof workflow.subjectId === "function"
    ? await workflow.subjectId(normalized.data, input.context)
    : workflow.subjectId;
  const workflowPolicy = await resolveApprovalWorkflowPolicy(workflow.adapter, {
    actorUserId: input.actorUserId,
    operation: workflow.operation,
    prepared: preparedPayload,
  });
  if (workflowPolicy.businessActionKey !== input.command.businessActionKey) {
    return serviceError("流程适配器返回了不匹配的业务行为", 500);
  }
  if (!workflowModeEnabled(workflowPolicy.mode)) {
    return executeBoundDirectCommand(input.command, normalized.data, input.context, input.authorize, input.forbiddenMessage);
  }

  const created = await createPreparedApprovalDraft({
    adapter: workflow.adapter,
    actorUserId: input.actorUserId,
    operation: workflow.operation,
    subjectId,
    prepared: preparedPayload,
    workflowPolicy,
    comment: workflow.comment,
  });
  if (!created.ok) return created;
  const submitted = await submit({
    adapter: workflow.adapter,
    requestId: created.data.request.id,
    actorUserId: input.actorUserId,
    expectedVersion: created.data.request.version,
    comment: workflow.comment,
  });
  if (!submitted.ok) return submitted;
  return serviceOk({ executionMode: "workflow", request: submitted.data.request });
}

export async function executeDirectBusinessActionCommand<TInput, TNormalized, TResult, TContext>(input: {
  command: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>;
  input: TInput;
  context: TContext;
  actorUserId: number;
  authorize?: (input: TNormalized, context: TContext) => MaybePromise<boolean>;
  forbiddenMessage?: string;
}): Promise<ServiceResult<TResult>> {
  const executed = await executeBusinessActionCommand<TInput, TNormalized, TResult, TContext, never>(input);
  if (!executed.ok) return executed;
  if (executed.data.executionMode !== "direct") {
    return serviceError(`业务行为 ${input.command.businessActionKey} 不应进入审批流程`, 500);
  }
  return serviceOk(executed.data.result);
}

export async function executeApprovedBusinessActionCommand<TInput, TNormalized, TResult, TContext>(input: {
  command: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>;
  input: TInput;
  context: TContext;
  authorize?: (input: TNormalized, context: TContext) => MaybePromise<boolean>;
  forbiddenMessage?: string;
}): Promise<ServiceResult<TResult>> {
  const binding = validateCommandBinding(input.command);
  if (!binding.ok) return binding;
  if (binding.data.workflow.kind !== "configurable") {
    return serviceError(`业务行为 ${input.command.businessActionKey} 不是可审批命令`, 500);
  }
  const normalized = await input.command.validate(input.input, input.context);
  if (!normalized.ok) return normalized;
  const committed = await executeBoundDirectCommand(
    input.command,
    normalized.data,
    input.context,
    input.authorize,
    input.forbiddenMessage,
  );
  if (!committed.ok) return committed;
  if (committed.data.executionMode !== "direct") {
    return serviceError(`业务行为 ${input.command.businessActionKey} 的审批提交返回了错误执行模式`, 500);
  }
  return serviceOk(committed.data.result);
}

type DirectBusinessActionCommit<TResult> = {
  authorize?: () => MaybePromise<boolean>;
  forbiddenMessage?: string;
  commit: () => MaybePromise<ServiceResult<TResult>>;
};

export type BusinessActionMutationResult<TResult, TPayload> =
  | { executionMode: "direct"; result: TResult }
  | { executionMode: "workflow"; request: ApprovalRequestDto<TPayload> };

export async function resolveBusinessActionRuntime(input: {
  businessActionKey: string;
  actor: {
    userId: number;
    canDirectWrite?: boolean;
    canStartWorkflow?: boolean;
    canProcessWorkflow?: boolean;
  };
  workflowApplicable?: boolean;
  resourceKey?: string | null;
  scopeType?: string | null;
  scopeId?: string | number | null;
  defaults?: WorkflowPolicyDefaults | null;
  request?: ActionRuntimeRequestSnapshot | null;
}): Promise<ActionRuntime> {
  const workflowPolicyMode = input.request
    ? "required"
    : input.workflowApplicable === false
      ? "permission_only"
      : (await resolveWorkflowPolicy({
          businessActionKey: input.businessActionKey,
          resourceKey: input.resourceKey,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          actorUserId: input.actor.userId,
          defaults: input.defaults,
        })).mode;
  return resolveActionRuntime({
    businessActionKey: input.businessActionKey,
    workflowPolicyMode,
    actor: input.actor,
    request: input.request,
  });
}

export async function assertBusinessActionDirectExecutionAllowed(input: {
  businessActionKey: string;
  actorUserId: number;
  workflowApplicable?: boolean;
  resourceKey?: string | null;
  scopeType?: string | null;
  scopeId?: string | number | null;
  defaults?: WorkflowPolicyDefaults | null;
  blockedMessage?: string;
}) {
  if (input.workflowApplicable === false) return serviceOk({ allowed: true as const });
  const policy = await resolveWorkflowPolicy({
    businessActionKey: input.businessActionKey,
    resourceKey: input.resourceKey,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    actorUserId: input.actorUserId,
    defaults: input.defaults,
  });
  if (workflowModeEnabled(policy.mode)) {
    return serviceError(input.blockedMessage ?? "该行为已启用流程，请提交审核", 409);
  }
  return serviceOk({ allowed: true as const });
}

async function executeDirectMutation<TResult>(
  mutation: DirectBusinessActionCommit<TResult>,
): Promise<ServiceResult<BusinessActionMutationResult<TResult, never>>> {
  if (mutation.authorize && !(await mutation.authorize())) {
    return serviceError(mutation.forbiddenMessage ?? "无权限执行该操作", 403);
  }
  const committed = await mutation.commit();
  if (!committed.ok) return committed;
  return serviceOk({ executionMode: "direct", result: committed.data });
}

function validateCommandBinding<TInput, TNormalized, TResult, TContext>(
  command: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>,
): ServiceResult<ActionContractMetadata> {
  const contract = getActionContractMetadata(command.businessActionKey);
  if (!contract) return serviceError(`业务行为 ${command.businessActionKey} 缺少 ActionContract`, 500);
  if ("executeKey" in contract.domain || (
    "bindings" in contract.domain && contract.domain.bindings?.some((binding) => "executeKey" in binding)
  )) return serviceError(`业务行为 ${command.businessActionKey} 不是 mutation command`, 500);
  const bindings = "bindings" in contract.domain && contract.domain.bindings
    ? contract.domain.bindings
    : [contract.domain];
  if (!bindings.some((binding) => (
    "commitKey" in binding
    && binding.validatorKey === command.validatorKey
    && binding.commitKey === command.commitKey
  ))) {
    return serviceError(`业务行为 ${command.businessActionKey} 的 validator/commit 绑定与 ActionContract 不一致`, 500);
  }
  return serviceOk(contract);
}

function executeBoundDirectCommand<TInput, TNormalized, TResult, TContext>(
  command: BusinessActionCommandAdapter<TInput, TNormalized, TResult, TContext>,
  normalized: TNormalized,
  context: TContext,
  authorize?: (input: TNormalized, context: TContext) => MaybePromise<boolean>,
  forbiddenMessage?: string,
) {
  return executeDirectMutation({
    authorize: authorize ? () => authorize(normalized, context) : undefined,
    forbiddenMessage,
    commit: () => command.commit(normalized, context),
  });
}
