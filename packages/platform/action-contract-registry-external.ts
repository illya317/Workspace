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

export const EXTERNAL_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  createContract("external.customers.party.create"),
  updateContract("external.customers.party.update"),
  deleteContract("external.customers.party.delete"),
  createContract("external.suppliers.party.create"),
  updateContract("external.suppliers.party.update"),
  deleteContract("external.suppliers.party.delete"),
]);
