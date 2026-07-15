import type { SubmitStatementSourcePackageInput } from "@workspace/finance/types";

import {
  buildStatementSourceScopeCommand,
  buildSubmitStatementSourcePackageCommand,
  buildUploadStatementSourcePackageCommand,
  type UploadStatementSourcePackageInput,
} from "../domain/statement-source-validation";
import {
  listStatementSourcePackages,
  submitStatementSourcePackage,
  uploadStatementSourcePackage,
} from "./source-packages";

export function buildUploadStatementSourcePackageRouteCommand(
  input: UploadStatementSourcePackageInput,
  userId: number,
) {
  return buildUploadStatementSourcePackageCommand(input, userId);
}

export function executeUploadStatementSourcePackageRouteCommand(
  command: Parameters<typeof uploadStatementSourcePackage>[0],
) {
  return uploadStatementSourcePackage(command);
}

export function buildSubmitStatementSourcePackageRouteCommand(
  packageId: number,
  input: SubmitStatementSourcePackageInput,
  userId: number,
) {
  return buildSubmitStatementSourcePackageCommand(packageId, input, userId);
}

export function executeSubmitStatementSourcePackageRouteCommand(
  command: Parameters<typeof submitStatementSourcePackage>[0],
) {
  return submitStatementSourcePackage(command);
}

export function buildListStatementSourcePackagesRouteCommand(input: {
  companyCode: string;
  year: number;
  month: number;
}) {
  return buildStatementSourceScopeCommand(input);
}

export function executeListStatementSourcePackagesRouteCommand(
  command: Parameters<typeof listStatementSourcePackages>[0],
) {
  return listStatementSourcePackages(command);
}
