import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import type { ExternalPartyCategory } from "@workspace/external/types";
import {
  buildExternalPartyCreateCommand,
  buildExternalPartyDeleteCommand,
  buildExternalPartyRoleAvailabilityCommand,
  buildExternalPartyUpdateCommand,
} from "./domain/external-party-validation";
import {
  commitCreateExternalPartyCommand,
  commitDeleteExternalPartyCommand,
  commitUpdateExternalPartyCommand,
} from "./external-party-service";
import { commitExternalPartyRoleAvailabilityCommand } from "./external-party-role-lifecycle-service";
import type {
  ExternalPartyCreateInput,
  ExternalPartyRoleAvailabilityCommandInput,
  ExternalPartyRoleEndInput,
  ExternalPartyUpdateInput,
} from "./schemas";

export {
  commitCreateExternalPartyCommand,
  commitDeleteExternalPartyCommand,
  commitUpdateExternalPartyCommand,
  listExternalParties,
} from "./external-party-service";

const CATEGORY_RESOURCE_SEGMENT: Record<ExternalPartyCategory, string> = {
  customer: "customers",
  supplier: "suppliers",
};

type ExternalPartyAction = "create" | "update" | "delete" | "availability.change";
type CreateInput = { category: ExternalPartyCategory; body: ExternalPartyCreateInput; userId: number; idempotencyKey: string };
type UpdateInput = { category: ExternalPartyCategory; id: number; body: ExternalPartyUpdateInput; userId: number; expectedVersion?: number; idempotencyKey: string };
type DeleteInput = { category: ExternalPartyCategory; id: number; body: ExternalPartyRoleEndInput; userId: number; expectedVersion?: number; idempotencyKey: string };
type AvailabilityInput = { category: ExternalPartyCategory; id: number; body: ExternalPartyRoleAvailabilityCommandInput; userId: number; expectedVersion?: number; idempotencyKey: string };

export function externalPartyBusinessActionKey(category: ExternalPartyCategory, action: ExternalPartyAction) {
  return `external.${CATEGORY_RESOURCE_SEGMENT[category]}.party.${action}`;
}

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

function createAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "create"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyCreateCommand",
    commitKey: "packages/external/server/external-parties.commitCreateExternalPartyCommand",
    validate: (input: CreateInput) => {
      const command = buildExternalPartyCreateCommand(input.category, input.body, input.userId, input.idempotencyKey);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitCreateExternalPartyCommand,
  });
}

function updateAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "update"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyUpdateCommand",
    commitKey: "packages/external/server/external-parties.commitUpdateExternalPartyCommand",
    validate: (input: UpdateInput) => {
      const command = buildExternalPartyUpdateCommand(input.id, input.category, input.body, input.userId, input.expectedVersion, input.idempotencyKey);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitUpdateExternalPartyCommand,
  });
}

function deleteAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "delete"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyDeleteCommand",
    commitKey: "packages/external/server/external-parties.commitDeleteExternalPartyCommand",
    validate: (input: DeleteInput) => {
      const command = buildExternalPartyDeleteCommand(input.id, input.category, input.userId, input.body, input.expectedVersion, input.idempotencyKey);
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitDeleteExternalPartyCommand,
  });
}

function availabilityAdapter(category: ExternalPartyCategory) {
  return defineBusinessActionCommandAdapter({
    businessActionKey: externalPartyBusinessActionKey(category, "availability.change"),
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyRoleAvailabilityCommand",
    commitKey: "packages/external/server/external-party-role-lifecycle-service.commitExternalPartyRoleAvailabilityCommand",
    validate: (input: AvailabilityInput) => {
      const command = buildExternalPartyRoleAvailabilityCommand(
        input.id,
        input.category,
        input.body,
        input.userId,
        input.expectedVersion,
        input.idempotencyKey,
      );
      return command.ok ? serviceOk(command.data) : validationError(command.issue);
    },
    commit: commitExternalPartyRoleAvailabilityCommand,
  });
}

export function executeCreateExternalPartyCommand(input: CreateInput) {
  return executeDirectBusinessActionCommand({ command: createAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}

export function executeUpdateExternalPartyCommand(input: UpdateInput) {
  return executeDirectBusinessActionCommand({ command: updateAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}

export function executeDeleteExternalPartyCommand(input: DeleteInput) {
  return executeDirectBusinessActionCommand({ command: deleteAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}

export function executeExternalPartyRoleAvailabilityCommand(input: AvailabilityInput) {
  return executeDirectBusinessActionCommand({ command: availabilityAdapter(input.category), input, context: undefined, actorUserId: input.userId });
}
