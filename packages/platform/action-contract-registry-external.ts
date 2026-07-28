import { defineActionContractMetadataList } from "./action-contract";
import {
  registeredLifecycle,
  registeredWrite,
} from "./action-contract-registry-helpers";

const domain = {
  create: {
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyCreateCommand",
    commitKey: "packages/external/server/external-parties.commitCreateExternalPartyCommand",
  },
  update: {
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyUpdateCommand",
    commitKey: "packages/external/server/external-parties.commitUpdateExternalPartyCommand",
  },
  delete: {
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyDeleteCommand",
    commitKey: "packages/external/server/external-parties.commitDeleteExternalPartyCommand",
  },
  availability: {
    validatorKey: "packages/external/server/domain/external-party-validation.buildExternalPartyRoleAvailabilityCommand",
    commitKey: "packages/external/server/external-party-role-lifecycle-service.commitExternalPartyRoleAvailabilityCommand",
  },
  relatedPartyCreate: {
    validatorKey: "packages/external/server/domain/related-party-validation.buildExternalRelatedPartyCreateCommand",
    commitKey: "packages/external/server/related-parties.commitCreateExternalRelatedPartyCommand",
  },
  relatedPartyDelete: {
    validatorKey: "packages/external/server/domain/related-party-validation.buildExternalRelatedPartyDeleteCommand",
    commitKey: "packages/external/server/related-parties.commitDeleteExternalRelatedPartyCommand",
  },
} as const;

function createContract(key: string) {
  return registeredWrite({
    key,
    // Route ids address the shared Party aggregate; the role mutation is
    // captured separately by ExternalPartyRole history snapshots.
    activeEntity: "Party",
    domain: domain.create,
    shape: "full_record",
    target: "new_record",
    commitMode: "activate",
  });
}

function updateContract(key: string) {
  const contract = registeredWrite({
    key,
    activeEntity: "Party",
    domain: domain.update,
    targetIdKey: "id",
  });
  return {
    ...contract,
    payload: { ...contract.payload, versionKey: "expectedVersion" },
  };
}

function deleteContract(key: string) {
  return registeredLifecycle({
    key,
    activeEntity: "Party",
    domain: domain.delete,
    operation: "custom",
    targetIdKey: "id",
    versionKey: "expectedVersion",
    referencePolicy: "domain",
    auditPolicy: "history",
  });
}

function availabilityContract(key: string) {
  return registeredLifecycle({
    key,
    activeEntity: "ExternalPartyRole",
    domain: domain.availability,
    operation: "custom",
    targetIdKey: "id",
    versionKey: "expectedVersion",
    referencePolicy: "domain",
    auditPolicy: "history",
  });
}

function relatedPartyCreateContract() {
  const contract = registeredWrite({
    key: "external.relatedParties.party.create",
    activeEntity: "Party",
    domain: domain.relatedPartyCreate,
    shape: "field_patch",
    target: "existing_record",
    targetIdKey: "partyId",
  });
  return {
    ...contract,
    payload: { ...contract.payload, versionKey: "expectedVersion" },
  };
}

function relatedPartyDeleteContract() {
  return registeredLifecycle({
    key: "external.relatedParties.party.delete",
    activeEntity: "Party",
    domain: domain.relatedPartyDelete,
    operation: "custom",
    targetIdKey: "partyId",
    versionKey: "expectedVersion",
    referencePolicy: "domain",
    auditPolicy: "history",
  });
}

export const EXTERNAL_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  createContract("external.customers.party.create"),
  updateContract("external.customers.party.update"),
  deleteContract("external.customers.party.delete"),
  availabilityContract("external.customers.party.availability.change"),
  createContract("external.suppliers.party.create"),
  updateContract("external.suppliers.party.update"),
  deleteContract("external.suppliers.party.delete"),
  availabilityContract("external.suppliers.party.availability.change"),
  relatedPartyCreateContract(),
  relatedPartyDeleteContract(),
]);
