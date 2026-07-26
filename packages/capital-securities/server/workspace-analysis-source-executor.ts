import "server-only";

import { listGovernanceOrganizations } from "@workspace/platform/server/organization-units";
import { flattenWorkspaceAnalysisNestedValue } from "@workspace/platform/server/workspace-analysis-nested-values";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import { WorkspaceAnalysisRuntimeError, type WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { listCompanies, listOwnershipInterests } from "./company-governance";
import { getInvestorRelationshipView } from "./investor-relationships";
import {
  buildCapitalSecuritiesWorkspaceAnalysisSourceCatalog,
  canDiscoverCapitalSecuritiesWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";

export function loadCapitalSecuritiesWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "capital-securities",
    sourceCatalog: buildCapitalSecuritiesWorkspaceAnalysisSourceCatalog(),
    request,
    canExecute: canDiscoverCapitalSecuritiesWorkspaceAnalysisSource,
    loadPage: async ({ registration, parameters, page, pageSize, signal }) => {
      if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", request.sourceKey);
      const sourceKey = registration.definition.sourceKey;
      if (sourceKey === "capital-securities.companies") {
        const result = await listCompanies({
          keyword: stringParameter(parameters.keyword),
          activeOnly: parameters.activeOnly === true,
          page,
          pageSize,
        });
        return { rows: result.companies, totalRows: result.total };
      }
      if (sourceKey === "capital-securities.ownership-interests") {
        const result = await listOwnershipInterests({ keyword: stringParameter(parameters.keyword), page, pageSize });
        return { rows: result.interests, totalRows: result.total };
      }
      if (
        sourceKey === "capital-securities.organizations"
        || sourceKey.startsWith("capital-securities.organization-")
        || sourceKey.startsWith("capital-securities.governance-position")
      ) {
        const result = await listGovernanceOrganizations();
        const rows = sourceKey === "capital-securities.organizations"
          ? result.organizations
          : sourceKey === "capital-securities.governance-positions"
            ? result.positions
            : sourceKey === "capital-securities.organization-descriptions"
              ? result.organizations.flatMap((organization) => organization.descriptions.flatMap((description) => (
                  flattenWorkspaceAnalysisNestedValue(description.details).map((value) => ({
                    rowKey: `${organization.id}:${description.id}:${value.path}`,
                    organizationId: organization.id,
                    organizationCode: organization.code,
                    organizationName: organization.name,
                    descriptionId: description.id,
                    sourceFile: description.sourceFile,
                    codeRaw: description.codeRaw,
                    ...value,
                  }))
                )))
              : sourceKey === "capital-securities.organization-managers"
                ? result.organizations.flatMap((organization) => {
                    const rowCount = Math.max(organization.managerEmployeeIds.length, organization.managerEmployeeNames.length);
                    return Array.from({ length: rowCount }, (_, ordinal) => ({
                      rowKey: `${organization.id}:${ordinal}`,
                      organizationId: organization.id,
                      organizationCode: organization.code,
                      organizationName: organization.name,
                      employeeId: organization.managerEmployeeIds[ordinal] ?? null,
                      employeeName: organization.managerEmployeeNames[ordinal] ?? null,
                      ordinal,
                    }));
                  })
                : sourceKey === "capital-securities.governance-position-managements"
                  ? result.positions.flatMap((position) => position.managerOfDepartmentIds.map((managedOrganizationId, ordinal) => ({
                      rowKey: `${position.id}:${managedOrganizationId}:${ordinal}`,
                      positionId: position.id,
                      positionCode: position.code,
                      positionName: position.name,
                      managedOrganizationId,
                      ordinal,
                    })))
                  : null;
        if (!rows) throw new WorkspaceAnalysisRuntimeError("source_unavailable", "资本证券经营分析数据源暂不可用", sourceKey);
        return paginate(rows, page, pageSize);
      }
      const view = await getInvestorRelationshipView({
        issuerCompanyId: integerParameter(parameters.issuerCompanyId),
        asOf: optionalStringParameter(parameters.asOf),
      });
      const rows = investorRows(sourceKey, view);
      if (!rows) throw new WorkspaceAnalysisRuntimeError("source_unavailable", "资本证券经营分析数据源暂不可用", sourceKey);
      return paginate(rows, page, pageSize);
    },
  });
}

function investorRows(
  sourceKey: string,
  view: Awaited<ReturnType<typeof getInvestorRelationshipView>>,
): readonly unknown[] | null {
  if (sourceKey === "capital-securities.investor-companies") return view.companies;
  if (sourceKey === "capital-securities.shareholders") return view.shareholders;
  if (sourceKey === "capital-securities.share-capital-events") return view.events;
  if (sourceKey === "capital-securities.captable-rounds") return view.captableRounds;
  if (sourceKey === "capital-securities.financing-rounds") return view.financingRounds;
  if (sourceKey === "capital-securities.share-capital-transactions") {
    return view.events.flatMap((event) => event.transactions.map((transaction) => ({
      eventId: event.id,
      eventSequence: event.sequence,
      eventName: event.eventName,
      effectiveDate: event.effectiveDate,
      recordStatus: event.recordStatus,
      ...transaction,
    })));
  }
  if (sourceKey === "capital-securities.financing-contributions") {
    return view.financingRounds.flatMap((round) => round.contributions.map((contribution) => ({
      eventId: round.eventId,
      roundSequence: round.sequence,
      roundLabel: round.label,
      effectiveDate: round.effectiveDate,
      recordStatus: round.recordStatus,
      kind: round.kind,
      ...contribution,
    })));
  }
  if (sourceKey === "capital-securities.captable-positions") {
    return view.captableRows.flatMap((shareholder) => shareholder.positions.map((position) => ({
      rowKey: `${shareholder.partyId}:${position.eventId}`,
      partyId: shareholder.partyId,
      partyName: shareholder.name,
      ...position,
    })));
  }
  if (sourceKey === "capital-securities.ownership-structure-nodes") {
    return view.ownershipStructure?.nodes ?? [];
  }
  if (sourceKey === "capital-securities.ownership-structure-edges") {
    return view.ownershipStructure?.edges ?? [];
  }
  return null;
}

function paginate(rows: readonly unknown[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

function stringParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : "";
}

function optionalStringParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function integerParameter(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
