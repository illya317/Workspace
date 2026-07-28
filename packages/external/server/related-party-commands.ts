import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import {
  buildExternalRelatedPartyCreateCommand,
  buildExternalRelatedPartyDeleteCommand,
} from "./domain/related-party-validation";
import {
  commitCreateExternalRelatedPartyCommand,
  commitDeleteExternalRelatedPartyCommand,
} from "./related-parties";
import type { ExternalRelatedPartyCreateInput } from "./schemas";

type CreateInput = {
  body: ExternalRelatedPartyCreateInput;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
};

const createRelatedPartyAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "external.relatedParties.party.create",
  validatorKey: "packages/external/server/domain/related-party-validation.buildExternalRelatedPartyCreateCommand",
  commitKey: "packages/external/server/related-parties.commitCreateExternalRelatedPartyCommand",
  validate: (input: CreateInput) => {
    const command = buildExternalRelatedPartyCreateCommand(
      input.body,
      input.userId,
      input.expectedVersion,
      input.idempotencyKey,
    );
    return command.ok
      ? serviceOk(command.data)
      : serviceError(command.issue.message, command.issue.status || 400);
  },
  commit: commitCreateExternalRelatedPartyCommand,
});

export function executeCreateExternalRelatedPartyCommand(input: CreateInput) {
  return executeDirectBusinessActionCommand({
    command: createRelatedPartyAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}

type DeleteInput = {
  partyId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
};

const deleteRelatedPartyAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "external.relatedParties.party.delete",
  validatorKey: "packages/external/server/domain/related-party-validation.buildExternalRelatedPartyDeleteCommand",
  commitKey: "packages/external/server/related-parties.commitDeleteExternalRelatedPartyCommand",
  validate: (input: DeleteInput) => {
    const command = buildExternalRelatedPartyDeleteCommand(
      input.partyId,
      input.userId,
      input.expectedVersion,
      input.idempotencyKey,
    );
    return command.ok
      ? serviceOk(command.data)
      : serviceError(command.issue.message, command.issue.status || 400);
  },
  commit: commitDeleteExternalRelatedPartyCommand,
});

export function executeDeleteExternalRelatedPartyCommand(input: DeleteInput) {
  return executeDirectBusinessActionCommand({
    command: deleteRelatedPartyAdapter,
    input,
    context: undefined,
    actorUserId: input.userId,
  });
}
