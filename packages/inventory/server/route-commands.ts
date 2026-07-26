import type { CreateInventoryDocumentInput, LinkInventoryVoucherInput } from "../types";
import { applyInventoryDocumentLifecycle, createInventoryDocument, linkInventoryClosingVoucher, listInventoryWorkspace } from "./service";
import { buildCreateInventoryDocumentCommand, buildInventoryDocumentLifecycleCommand, buildLinkInventoryVoucherCommand } from "./validation";

export function buildCreateInventoryDocumentRouteCommand(input: CreateInventoryDocumentInput, userId: number) { return buildCreateInventoryDocumentCommand(input, userId); }
export function executeCreateInventoryDocumentRouteCommand(command: { input: CreateInventoryDocumentInput; userId: number }) { return createInventoryDocument(command.input, command.userId); }
export function buildInventoryDocumentLifecycleRouteCommand(input: { id: number; action: "post" | "reverse" }, userId: number) { return buildInventoryDocumentLifecycleCommand(input, userId); }
export function executeInventoryDocumentLifecycleRouteCommand(command: { id: number; action: "post" | "reverse"; userId: number }) { return applyInventoryDocumentLifecycle(command); }
export function executeListInventoryWorkspaceCommand(command: { companyCode: string; year: number; month: number }) { return listInventoryWorkspace(command); }
export function buildLinkInventoryVoucherRouteCommand(input: LinkInventoryVoucherInput, userId: number) { return buildLinkInventoryVoucherCommand(input, userId); }
export function executeLinkInventoryVoucherRouteCommand(command: LinkInventoryVoucherInput & { userId: number }) { return linkInventoryClosingVoucher(command, command.userId); }
