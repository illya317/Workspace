import type { ConfirmFinanceAssetAcquisitionEvidenceInput, ConfirmFinanceAssetDisposalInput, ConfirmFinanceAssetImpairmentAssessmentInput, CreateFinanceAssetCardInput, DeleteFinanceAssetCategoryPolicyInput, LinkFinanceAssetPeriodVoucherInput, UpdateFinanceAssetCardInput, UpdateFinanceAssetCategoryPolicyInput } from "../../types/assets";
import { confirmFinanceAssetAcquisitionEvidence, confirmFinanceAssetDisposal, confirmFinanceAssetImpairmentAssessment, linkFinanceAssetPeriodVoucher } from "./close-evidence-service";
import { recalculateFinanceAssetPeriod } from "./recalculation-service";
import { createFinanceAssetCard, deleteFinanceAssetCategoryPolicy, listFinanceAssetWorkspace, previewFinanceAssetCardCode, updateFinanceAssetCard, updateFinanceAssetCategoryPolicy } from "./service";
import {
  buildConfirmFinanceAssetDisposalCommand,
  buildConfirmFinanceAssetAcquisitionEvidenceCommand,
  buildConfirmFinanceAssetImpairmentAssessmentCommand,
  buildCreateFinanceAssetCardCommand,
  buildDeleteFinanceAssetCategoryPolicyCommand,
  buildPreviewFinanceAssetCodeCommand,
  buildRecalculateFinanceAssetPeriodCommand,
  buildLinkFinanceAssetPeriodVoucherCommand,
  buildUpdateFinanceAssetCardCommand,
  buildUpdateFinanceAssetCategoryPolicyCommand,
  type FinanceAssetDisposalConfirmCommand,
  type FinanceAssetAcquisitionEvidenceConfirmCommand,
  type FinanceAssetImpairmentAssessmentConfirmCommand,
  type FinanceAssetPeriodVoucherLinkCommand,
  type FinanceAssetCardCreateCommand,
  type FinanceAssetCardUpdateCommand,
  type FinanceAssetCodePreviewCommand,
  type FinanceAssetCategoryPolicyUpdateCommand,
  type FinanceAssetCategoryPolicyDeleteCommand,
} from "./validation";

export function buildCreateFinanceAssetCardRouteCommand(input: CreateFinanceAssetCardInput, userId: number) {
  return buildCreateFinanceAssetCardCommand(input, userId);
}

export function executeCreateFinanceAssetCardRouteCommand(command: FinanceAssetCardCreateCommand) {
  return createFinanceAssetCard(command);
}

export function buildPreviewFinanceAssetCodeRouteCommand(input: { companyCode: string; year: number; categoryId: number }) {
  return buildPreviewFinanceAssetCodeCommand(input);
}

export function executePreviewFinanceAssetCodeRouteCommand(command: FinanceAssetCodePreviewCommand) {
  return previewFinanceAssetCardCode(command);
}

export function buildUpdateFinanceAssetCardRouteCommand(input: UpdateFinanceAssetCardInput, userId: number) {
  return buildUpdateFinanceAssetCardCommand(input, userId);
}

export function executeUpdateFinanceAssetCardRouteCommand(command: FinanceAssetCardUpdateCommand) {
  return updateFinanceAssetCard(command);
}

export function buildUpdateFinanceAssetCategoryPolicyRouteCommand(input: UpdateFinanceAssetCategoryPolicyInput, userId: number) {
  return buildUpdateFinanceAssetCategoryPolicyCommand(input, userId);
}

export function executeUpdateFinanceAssetCategoryPolicyRouteCommand(command: FinanceAssetCategoryPolicyUpdateCommand) {
  return updateFinanceAssetCategoryPolicy(command);
}

export function buildDeleteFinanceAssetCategoryPolicyRouteCommand(input: DeleteFinanceAssetCategoryPolicyInput, userId: number) {
  return buildDeleteFinanceAssetCategoryPolicyCommand(input, userId);
}

export function executeDeleteFinanceAssetCategoryPolicyRouteCommand(command: FinanceAssetCategoryPolicyDeleteCommand) {
  return deleteFinanceAssetCategoryPolicy(command);
}

export function executeListFinanceAssetWorkspaceCommand(command: { companyCode: string; year: number; month: number }) {
  return listFinanceAssetWorkspace(command);
}

export function executeRecalculateFinanceAssetPeriodCommand(command: { companyCode: string; year: number; month: number }) {
  return recalculateFinanceAssetPeriod(command);
}

export function buildRecalculateFinanceAssetPeriodRouteCommand(input: { companyCode: string; year: number; month: number }) {
  return buildRecalculateFinanceAssetPeriodCommand(input);
}

export function buildConfirmFinanceAssetImpairmentAssessmentRouteCommand(input: ConfirmFinanceAssetImpairmentAssessmentInput, userId: number) {
  return buildConfirmFinanceAssetImpairmentAssessmentCommand(input, userId);
}

export function executeConfirmFinanceAssetImpairmentAssessmentRouteCommand(command: FinanceAssetImpairmentAssessmentConfirmCommand) {
  return confirmFinanceAssetImpairmentAssessment(command);
}

export function buildConfirmFinanceAssetAcquisitionEvidenceRouteCommand(input: ConfirmFinanceAssetAcquisitionEvidenceInput, userId: number) {
  return buildConfirmFinanceAssetAcquisitionEvidenceCommand(input, userId);
}

export function executeConfirmFinanceAssetAcquisitionEvidenceRouteCommand(command: FinanceAssetAcquisitionEvidenceConfirmCommand) {
  return confirmFinanceAssetAcquisitionEvidence(command);
}

export function buildConfirmFinanceAssetDisposalRouteCommand(input: ConfirmFinanceAssetDisposalInput, userId: number) {
  return buildConfirmFinanceAssetDisposalCommand(input, userId);
}

export function executeConfirmFinanceAssetDisposalRouteCommand(command: FinanceAssetDisposalConfirmCommand) {
  return confirmFinanceAssetDisposal(command);
}

export function buildLinkFinanceAssetPeriodVoucherRouteCommand(input: LinkFinanceAssetPeriodVoucherInput) {
  return buildLinkFinanceAssetPeriodVoucherCommand(input);
}

export function executeLinkFinanceAssetPeriodVoucherRouteCommand(command: FinanceAssetPeriodVoucherLinkCommand) {
  return linkFinanceAssetPeriodVoucher(command);
}
