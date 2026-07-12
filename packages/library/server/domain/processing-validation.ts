import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { LIBRARY_PIPELINE_VERSION } from "../../constants/pipeline";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ProcessLibraryVersionCommand {
  versionUid: string;
  pipelineVersion: string;
}

export interface LibraryVersionRuntimeStorageCommand {
  versionId: number;
}

export function buildLibraryVersionRuntimeStorageCommand(input: {
  versionId: number;
}): DomainValidationResult<LibraryVersionRuntimeStorageCommand> {
  if (!Number.isInteger(input.versionId) || input.versionId <= 0) {
    return failCommand("Invalid version id", 400, "versionId");
  }
  return okCommand({ versionId: input.versionId });
}

export function buildProcessLibraryVersionCommand(input: {
  versionUid: string;
  pipelineVersion?: string;
}): DomainValidationResult<ProcessLibraryVersionCommand> {
  if (!UUID_PATTERN.test(input.versionUid)) return failCommand("Invalid version UID", 400, "versionUid");
  const pipelineVersion = (input.pipelineVersion || LIBRARY_PIPELINE_VERSION).trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(pipelineVersion)) {
    return failCommand("Invalid pipeline version", 400, "pipelineVersion");
  }
  return okCommand({ versionUid: input.versionUid, pipelineVersion });
}
