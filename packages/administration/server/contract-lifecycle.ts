import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere } from "./contract-access";
import { contractTimelineWithClient } from "./contract-lifecycle-records";
import {
  commitCreateContractRevision,
  commitPublishContractRevision,
} from "./contract-revisions";
import {
  commitContractStateTransition,
  commitReverseContractStateEvent,
} from "./contract-state-events";
import {
  buildContractRevisionCreateCommand,
  buildContractRevisionPublishCommand,
  buildContractStateReverseCommand,
  buildContractStateTransitionCommand,
} from "./domain/contract-lifecycle-validation";
import type {
  ContractRevisionCreateInput,
  ContractRevisionPublishInput,
  ContractStateReverseInput,
  ContractStateTransitionInput,
} from "./schemas";

type RevisionCreateInput = {
  contractId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractRevisionCreateInput;
};

type RevisionPublishInput = {
  contractId: number;
  revisionId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractRevisionPublishInput;
};

type StateTransitionInput = {
  contractId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractStateTransitionInput;
};

type StateReverseInput = {
  contractId: number;
  eventId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractStateReverseInput;
};

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

export async function loadContractLifecycleTimeline(input: { contractId: number; userId: number }) {
  const accessWhere = await buildContractRecordAccessWhere(input.userId);
  const visible = await prisma.contract.findFirst({
    where: { AND: [{ id: input.contractId }, accessWhere] },
    select: { id: true },
  });
  if (!visible) return serviceError("合同不存在", 404);
  return serviceOk(await contractTimelineWithClient(prisma, input.contractId));
}

const createRevisionAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.revision.create",
  validatorKey: "packages/administration/server/domain/contract-lifecycle-validation.buildContractRevisionCreateCommand",
  commitKey: "packages/administration/server/contract-revisions.commitCreateContractRevision",
  validate: async (input: RevisionCreateInput) => {
    const command = await buildContractRevisionCreateCommand(input);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitCreateContractRevision,
});

const publishRevisionAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.revision.publish",
  validatorKey: "packages/administration/server/domain/contract-lifecycle-validation.buildContractRevisionPublishCommand",
  commitKey: "packages/administration/server/contract-revisions.commitPublishContractRevision",
  validate: (input: RevisionPublishInput) => {
    const command = buildContractRevisionPublishCommand(input);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitPublishContractRevision,
});

const transitionStateAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.state.transition",
  validatorKey: "packages/administration/server/domain/contract-lifecycle-validation.buildContractStateTransitionCommand",
  commitKey: "packages/administration/server/contract-state-events.commitContractStateTransition",
  validate: (input: StateTransitionInput) => {
    const command = buildContractStateTransitionCommand(input);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitContractStateTransition,
});

const reverseStateAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.state.reverse",
  validatorKey: "packages/administration/server/domain/contract-lifecycle-validation.buildContractStateReverseCommand",
  commitKey: "packages/administration/server/contract-state-events.commitReverseContractStateEvent",
  validate: (input: StateReverseInput) => {
    const command = buildContractStateReverseCommand(input);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitReverseContractStateEvent,
});

export function executeCreateContractRevision(input: RevisionCreateInput) {
  return executeDirectBusinessActionCommand({ command: createRevisionAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executePublishContractRevision(input: RevisionPublishInput) {
  return executeDirectBusinessActionCommand({ command: publishRevisionAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeContractStateTransition(input: StateTransitionInput) {
  return executeDirectBusinessActionCommand({ command: transitionStateAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeReverseContractStateEvent(input: StateReverseInput) {
  return executeDirectBusinessActionCommand({ command: reverseStateAdapter, input, context: undefined, actorUserId: input.userId });
}
