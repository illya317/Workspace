import type {
  ConsolidationBatchLifecycleInput,
  DeleteConsolidationMutationInput,
  EnsureConsolidationBatchInput,
  GenerateConsolidationEntriesInput,
  SaveConsolidationControlDecisionInput,
  SaveConsolidationEntryInput,
  SaveConsolidationSourcesInput,
  SaveConsolidationTaxEffectInput,
} from "@workspace/finance/types";
import {
  buildConsolidationBatchLifecycleCommand,
  buildEnsureConsolidationBatchCommand,
  buildSaveConsolidationControlDecisionCommand,
  buildSaveConsolidationSourcesCommand,
} from "../domain/consolidation-batch-validation";
import {
  buildDeleteConsolidationEntryCommand,
  buildDeleteConsolidationTaxEffectCommand,
  buildGenerateConsolidationEntriesCommand,
  buildSaveConsolidationEntryCommand,
  buildSaveConsolidationTaxEffectCommand,
} from "../domain/consolidation-entry-validation";
import { ensureConsolidationBatch } from "./consolidation-batches";
import {
  deleteConsolidationEntry,
  deleteConsolidationTaxEffect,
  saveConsolidationEntry,
  saveConsolidationTaxEffect,
} from "./consolidation-entries";
import { generateConsolidationEntries } from "./consolidation-entry-generation";
import { executeConsolidationBatchLifecycle } from "./consolidation-lifecycle";
import { saveConsolidationControlDecision, saveConsolidationSources } from "./consolidation-sources";

export function buildEnsureConsolidationBatchRouteCommand(input: EnsureConsolidationBatchInput, userId: number) {
  return buildEnsureConsolidationBatchCommand(input, userId);
}

export function executeEnsureConsolidationBatchRouteCommand(command: Parameters<typeof ensureConsolidationBatch>[0]) {
  return ensureConsolidationBatch(command);
}

export function buildSaveConsolidationSourcesRouteCommand(
  batchId: unknown,
  input: SaveConsolidationSourcesInput,
  userId: number,
) {
  return buildSaveConsolidationSourcesCommand(batchId, input, userId);
}

export function executeSaveConsolidationSourcesRouteCommand(command: Parameters<typeof saveConsolidationSources>[0]) {
  return saveConsolidationSources(command);
}

export function buildSaveConsolidationControlDecisionRouteCommand(
  batchId: unknown,
  input: SaveConsolidationControlDecisionInput,
  userId: number,
) {
  return buildSaveConsolidationControlDecisionCommand(batchId, input, userId);
}

export function executeSaveConsolidationControlDecisionRouteCommand(command: Parameters<typeof saveConsolidationControlDecision>[0]) {
  return saveConsolidationControlDecision(command);
}

export function buildSaveConsolidationEntryRouteCommand(
  batchId: unknown,
  input: SaveConsolidationEntryInput,
  userId: number,
) {
  return buildSaveConsolidationEntryCommand(batchId, input, userId);
}

export function executeSaveConsolidationEntryRouteCommand(command: Parameters<typeof saveConsolidationEntry>[0]) {
  return saveConsolidationEntry(command);
}

export function buildGenerateConsolidationEntriesRouteCommand(
  batchId: unknown,
  input: GenerateConsolidationEntriesInput,
  userId: number,
) {
  return buildGenerateConsolidationEntriesCommand(batchId, input, userId);
}

export function executeGenerateConsolidationEntriesRouteCommand(
  command: Parameters<typeof generateConsolidationEntries>[0],
) {
  return generateConsolidationEntries(command);
}

export function buildSaveConsolidationTaxEffectRouteCommand(
  batchId: unknown,
  entryId: unknown,
  input: SaveConsolidationTaxEffectInput,
  userId: number,
) {
  return buildSaveConsolidationTaxEffectCommand(batchId, entryId, input, userId);
}

export function executeSaveConsolidationTaxEffectRouteCommand(command: Parameters<typeof saveConsolidationTaxEffect>[0]) {
  return saveConsolidationTaxEffect(command);
}

export function buildDeleteConsolidationEntryRouteCommand(
  batchId: unknown,
  entryId: unknown,
  input: DeleteConsolidationMutationInput,
  userId: number,
) {
  return buildDeleteConsolidationEntryCommand(batchId, entryId, input, userId);
}

export function executeDeleteConsolidationEntryRouteCommand(command: Parameters<typeof deleteConsolidationEntry>[0]) {
  return deleteConsolidationEntry(command);
}

export function buildDeleteConsolidationTaxEffectRouteCommand(
  batchId: unknown,
  entryId: unknown,
  taxEffectId: unknown,
  input: DeleteConsolidationMutationInput,
  userId: number,
) {
  return buildDeleteConsolidationTaxEffectCommand(batchId, entryId, taxEffectId, input, userId);
}

export function executeDeleteConsolidationTaxEffectRouteCommand(
  command: Parameters<typeof deleteConsolidationTaxEffect>[0],
) {
  return deleteConsolidationTaxEffect(command);
}

export function buildSubmitConsolidationBatchRouteCommand(
  batchId: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
) {
  return buildConsolidationBatchLifecycleCommand("submit", batchId, userId, input);
}

export function buildReturnConsolidationBatchRouteCommand(
  batchId: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
) {
  return buildConsolidationBatchLifecycleCommand("return", batchId, userId, input);
}

export function buildReviewConsolidationBatchRouteCommand(
  batchId: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
) {
  return buildConsolidationBatchLifecycleCommand("review", batchId, userId, input);
}

export function buildLockConsolidationBatchRouteCommand(
  batchId: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
) {
  return buildConsolidationBatchLifecycleCommand("lock", batchId, userId, input);
}

export function buildPublishConsolidationBatchRouteCommand(
  batchId: unknown,
  userId: number,
  input: ConsolidationBatchLifecycleInput,
) {
  return buildConsolidationBatchLifecycleCommand("publish", batchId, userId, input);
}

export function executeConsolidationBatchLifecycleRouteCommand(
  command: Parameters<typeof executeConsolidationBatchLifecycle>[0],
) {
  return executeConsolidationBatchLifecycle(command);
}
