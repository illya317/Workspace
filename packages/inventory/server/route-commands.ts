import type { CreateInventoryDocumentInput, CreateInventoryItemInput, LinkInventoryVoucherInput } from "../types";
import { applyInventoryDocumentLifecycle, createInventoryDocument, createInventoryItem, linkInventoryClosingVoucher, listInventoryWorkspace } from "./service";
import { buildCreateInventoryDocumentCommand, buildCreateInventoryItemCommand, buildInventoryDocumentLifecycleCommand, buildLinkInventoryVoucherCommand } from "./validation";

export function buildCreateInventoryItemRouteCommand(input: CreateInventoryItemInput, userId: number) { return buildCreateInventoryItemCommand(input, userId); }
export function executeCreateInventoryItemRouteCommand(command: { input: CreateInventoryItemInput; userId: number }) { return createInventoryItem(command.input, command.userId); }
export function buildCreateInventoryDocumentRouteCommand(input: CreateInventoryDocumentInput, userId: number) { return buildCreateInventoryDocumentCommand(input, userId); }
export function executeCreateInventoryDocumentRouteCommand(command: { input: CreateInventoryDocumentInput; userId: number }) { return createInventoryDocument(command.input, command.userId); }
export function buildInventoryDocumentLifecycleRouteCommand(input: { id: number; action: "post" | "reverse" }, userId: number) { return buildInventoryDocumentLifecycleCommand(input, userId); }
export function executeInventoryDocumentLifecycleRouteCommand(command: { id: number; action: "post" | "reverse"; userId: number }) { return applyInventoryDocumentLifecycle(command); }
export function executeListInventoryWorkspaceCommand(command: { companyCode: string; year: number; month: number }) { return listInventoryWorkspace(command); }
export function buildLinkInventoryVoucherRouteCommand(input: LinkInventoryVoucherInput, userId: number) { return buildLinkInventoryVoucherCommand(input, userId); }
export function executeLinkInventoryVoucherRouteCommand(command: LinkInventoryVoucherInput & { userId: number }) { return linkInventoryClosingVoucher(command, command.userId); }
