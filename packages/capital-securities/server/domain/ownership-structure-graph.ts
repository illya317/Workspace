import type {
  OwnershipStructureEdge,
  OwnershipStructureGraph,
  OwnershipStructureGroup,
  OwnershipStructureNode,
} from "../../types";

const FULL_OWNERSHIP_THRESHOLD = 0.999999;

export type OwnershipStructureCompanyInput = {
  id: number;
  partyId: number;
  code: string;
  name: string;
  fullName: string | null;
  description?: string | null;
};

export type OwnershipStructureShareholderInput = {
  partyId: number;
  name: string;
  confirmedSubscribedCapitalYuan: number;
  pendingCapitalDeltaYuan: number;
};

export type OwnershipStructureInterestInput = {
  id: number;
  ownerPartyId: number;
  ownerName: string;
  issuerCompanyId: number;
  shareRatio: number | null;
  isConsolidated: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  recordStatus: "confirmed" | "pending";
};

export type OwnershipStructureShareholderGroupInput = {
  id: number;
  groupKey: string;
  label: string;
  sortOrder: number;
  memberships: readonly {
    partyId: number;
    sortOrder: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    recordStatus: "confirmed" | "pending";
  }[];
};

type ProjectedRelation = {
  ownerPartyId: number;
  ownerName: string;
  ownerCompanyId: number | null;
  issuerCompanyId: number;
  shareRatio: number | null;
  previousShareRatio: number | null;
  isConsolidated: boolean;
  recordStatus: "confirmed" | "pending";
  sourceIds: number[];
};

type ChildRelationGroup = {
  company: OwnershipStructureCompanyInput;
  direct: ProjectedRelation;
  coOwners: ProjectedRelation[];
};

export function buildOwnershipStructureGraph(input: {
  asOf: string;
  rootCompany: OwnershipStructureCompanyInput;
  companies: readonly OwnershipStructureCompanyInput[];
  shareholders: readonly OwnershipStructureShareholderInput[];
  shareholderGroups?: readonly OwnershipStructureShareholderGroupInput[];
  totalRegisteredCapitalYuan: number;
  interests: readonly OwnershipStructureInterestInput[];
}): OwnershipStructureGraph {
  const asOfDate = new Date(`${input.asOf}T00:00:00.000Z`);
  const companiesById = new Map(input.companies.map((company) => [company.id, company]));
  const companyByPartyId = new Map(input.companies.map((company) => [company.partyId, company]));
  const projectedRelations = projectActiveRelations(input.interests, companyByPartyId, asOfDate);
  const outgoingByOwnerCompanyId = groupBy(
    projectedRelations.filter((relation) => relation.ownerCompanyId !== null),
    (relation) => relation.ownerCompanyId as number,
  );
  const incomingByIssuerCompanyId = groupBy(projectedRelations, (relation) => relation.issuerCompanyId);
  const nodes: OwnershipStructureNode[] = [];
  const edges: OwnershipStructureEdge[] = [];
  const groups: OwnershipStructureGroup[] = [];
  let layoutOrder = 0;
  const nextOrder = () => layoutOrder++;
  const rootNodeKey = `focus-company:${input.rootCompany.id}`;

  const projectedGroups = projectShareholderGroups(input.shareholderGroups ?? [], asOfDate);
  const membershipByPartyId = new Map(projectedGroups.flatMap((group) => (
    group.members.map((membership) => [membership.partyId, { group, membership }] as const)
  )));
  const orderedShareholders = [...input.shareholders].sort((left, right) => {
    const leftMembership = membershipByPartyId.get(left.partyId);
    const rightMembership = membershipByPartyId.get(right.partyId);
    if (leftMembership && rightMembership) {
      return leftMembership.group.sortOrder - rightMembership.group.sortOrder
        || leftMembership.membership.sortOrder - rightMembership.membership.sortOrder
        || left.name.localeCompare(right.name, "zh-CN");
    }
    if (leftMembership) return -1;
    if (rightMembership) return 1;
    return projectedCapital(right) - projectedCapital(left)
      || left.name.localeCompare(right.name, "zh-CN");
  });
  const rootShareholderEdgeByPartyId = new Map<number, OwnershipStructureEdge>();

  for (const shareholder of orderedShareholders) {
    const projectedCapital = shareholder.confirmedSubscribedCapitalYuan + shareholder.pendingCapitalDeltaYuan;
    if (shareholder.confirmedSubscribedCapitalYuan <= 0 && projectedCapital <= 0) continue;
    const nodeKey = `root-shareholder:${shareholder.partyId}`;
    nodes.push({
      key: nodeKey,
      entityPartyId: shareholder.partyId,
      companyId: companyByPartyId.get(shareholder.partyId)?.id ?? null,
      label: shareholder.name,
      subtitle: null,
      role: "shareholder",
      layoutOrder: membershipByPartyId.get(shareholder.partyId)?.membership.sortOrder,
    });
    const confirmedRatio = ratio(shareholder.confirmedSubscribedCapitalYuan, input.totalRegisteredCapitalYuan);
    const projectedRatio = ratio(projectedCapital, input.totalRegisteredCapitalYuan);
    const edge: OwnershipStructureEdge = {
      key: `share-capital:${shareholder.partyId}`,
      source: nodeKey,
      target: rootNodeKey,
      shareRatio: shareholder.pendingCapitalDeltaYuan === 0 ? confirmedRatio : projectedRatio,
      previousShareRatio: shareholder.pendingCapitalDeltaYuan === 0 ? null : confirmedRatio,
      recordStatus: shareholder.pendingCapitalDeltaYuan === 0 ? "confirmed" : "pending",
      relationType: "share_capital",
      isConsolidated: false,
    };
    edges.push(edge);
    rootShareholderEdgeByPartyId.set(shareholder.partyId, edge);
  }

  for (const projectedGroup of projectedGroups) {
    const memberNodes = projectedGroup.members.flatMap((membership) => {
      const edge = rootShareholderEdgeByPartyId.get(membership.partyId);
      return edge ? [{ nodeKey: edge.source, edge, membership }] : [];
    });
    if (memberNodes.length === 0) continue;
    const projectedRatio = memberNodes.reduce((sum, member) => sum + (member.edge.shareRatio ?? 0), 0);
    const previousRatio = memberNodes.reduce(
      (sum, member) => sum + (member.edge.previousShareRatio ?? member.edge.shareRatio ?? 0),
      0,
    );
    const pending = memberNodes.some((member) => (
      member.edge.recordStatus === "pending" || member.membership.recordStatus === "pending"
    ));
    groups.push({
      key: `shareholder-group:${projectedGroup.id}`,
      label: projectedGroup.label,
      memberNodeKeys: memberNodes.map((member) => member.nodeKey),
      shareRatio: projectedRatio,
      previousShareRatio: pending ? previousRatio : null,
      recordStatus: pending ? "pending" : "confirmed",
      layoutOrder: projectedGroup.sortOrder,
    });
  }

  nodes.push({
    key: rootNodeKey,
    entityPartyId: input.rootCompany.partyId,
    companyId: input.rootCompany.id,
    label: input.rootCompany.name,
    subtitle: input.rootCompany.fullName,
    role: "focus",
    layoutOrder: nextOrder(),
  });

  appendCompanyChildren({
    parentCompany: input.rootCompany,
    parentNodeKey: rootNodeKey,
    path: [input.rootCompany.id],
    companiesById,
    outgoingByOwnerCompanyId,
    incomingByIssuerCompanyId,
    nodes,
    edges,
    nextOrder,
  });

  return {
    asOf: input.asOf,
    rootCompanyId: input.rootCompany.id,
    rootPartyId: input.rootCompany.partyId,
    rootNodeKey,
    groups,
    nodes,
    edges,
  };
}

function projectShareholderGroups(
  groups: readonly OwnershipStructureShareholderGroupInput[],
  asOf: Date,
) {
  const partyAssignments = new Map<number, {
    group: OwnershipStructureShareholderGroupInput;
    membership: OwnershipStructureShareholderGroupInput["memberships"][number];
  }>();
  for (const group of [...groups].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)) {
    for (const membership of group.memberships) {
      if (membership.effectiveFrom > asOf || (membership.effectiveTo !== null && membership.effectiveTo < asOf)) continue;
      const current = partyAssignments.get(membership.partyId);
      const shouldReplace = !current
        || membership.recordStatus === "pending" && current.membership.recordStatus !== "pending"
        || membership.recordStatus === current.membership.recordStatus
          && membership.effectiveFrom > current.membership.effectiveFrom;
      if (shouldReplace) partyAssignments.set(membership.partyId, { group, membership });
    }
  }
  return [...groups]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map((group) => ({
      ...group,
      members: [...partyAssignments.values()]
        .filter((assignment) => assignment.group.id === group.id)
        .map((assignment) => assignment.membership)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.partyId - right.partyId),
    }))
    .filter((group) => group.members.length > 0);
}

function appendCompanyChildren(input: {
  parentCompany: OwnershipStructureCompanyInput;
  parentNodeKey: string;
  path: number[];
  companiesById: ReadonlyMap<number, OwnershipStructureCompanyInput>;
  outgoingByOwnerCompanyId: ReadonlyMap<number, ProjectedRelation[]>;
  incomingByIssuerCompanyId: ReadonlyMap<number, ProjectedRelation[]>;
  nodes: OwnershipStructureNode[];
  edges: OwnershipStructureEdge[];
  nextOrder: () => number;
}) {
  const childGroups = arrangeChildGroups((input.outgoingByOwnerCompanyId.get(input.parentCompany.id) ?? [])
    .flatMap((direct): ChildRelationGroup[] => {
      const company = input.companiesById.get(direct.issuerCompanyId);
      if (!company) return [];
      const coOwners = (input.incomingByIssuerCompanyId.get(company.id) ?? [])
        .filter((relation) => relation.ownerPartyId !== input.parentCompany.partyId);
      return [{ company, direct, coOwners }];
    }));

  childGroups.forEach((group, childIndex) => {
    const occurrencePath = [...input.path, group.company.id];
    const childNodeKey = `subsidiary:${occurrencePath.join("/")}:${childIndex}`;
    input.nodes.push({
      key: childNodeKey,
      entityPartyId: group.company.partyId,
      companyId: group.company.id,
      label: group.company.name,
      subtitle: group.company.description ?? null,
      role: "subsidiary",
      layoutOrder: input.nextOrder(),
    });
    input.edges.push(edgeFromRelation(group.direct, input.parentNodeKey, childNodeKey, occurrencePath));

    group.coOwners.forEach((relation, coOwnerIndex) => {
      const ownerCompany = relation.ownerCompanyId === null
        ? null
        : input.companiesById.get(relation.ownerCompanyId) ?? null;
      const coOwnerNodeKey = `co-owner:${occurrencePath.join("/")}:${relation.ownerPartyId}:${coOwnerIndex}`;
      input.nodes.push({
        key: coOwnerNodeKey,
        entityPartyId: relation.ownerPartyId,
        companyId: ownerCompany?.id ?? null,
        label: relation.ownerName,
        subtitle: null,
        role: "co_owner",
        layoutOrder: input.nextOrder(),
      });
      input.edges.push(edgeFromRelation(relation, coOwnerNodeKey, childNodeKey, occurrencePath));
    });

    if (!input.path.includes(group.company.id)) {
      appendCompanyChildren({
        ...input,
        parentCompany: group.company,
        parentNodeKey: childNodeKey,
        path: occurrencePath,
      });
    }
  });
}

function arrangeChildGroups(groups: ChildRelationGroup[]) {
  const sorted = [...groups].sort((left, right) => (
    left.direct.shareRatio === right.direct.shareRatio
      ? left.company.code.localeCompare(right.company.code)
      : (right.direct.shareRatio ?? -1) - (left.direct.shareRatio ?? -1)
  ));
  const whollyOwned = sorted.filter((group) => (group.direct.shareRatio ?? 0) >= FULL_OWNERSHIP_THRESHOLD);
  const partial = sorted.filter((group) => (group.direct.shareRatio ?? 0) < FULL_OWNERSHIP_THRESHOLD);
  const left = partial.filter((_, index) => index % 2 === 0);
  const right = partial.filter((_, index) => index % 2 === 1);
  return [...left, ...whollyOwned, ...right];
}

function projectActiveRelations(
  interests: readonly OwnershipStructureInterestInput[],
  companyByPartyId: ReadonlyMap<number, OwnershipStructureCompanyInput>,
  asOf: Date,
): ProjectedRelation[] {
  const active = interests.filter((interest) => (
    (interest.effectiveFrom === null || interest.effectiveFrom <= asOf)
    && (interest.effectiveTo === null || interest.effectiveTo >= asOf)
  ));
  const grouped = groupBy(active, (interest) => `${interest.ownerPartyId}:${interest.issuerCompanyId}`);
  return [...grouped.values()].map((relations) => {
    const ordered = [...relations].sort((left, right) => right.id - left.id);
    const pending = ordered.find((interest) => interest.recordStatus === "pending");
    const confirmed = ordered.find((interest) => interest.recordStatus === "confirmed");
    const current = pending ?? confirmed ?? ordered[0];
    if (!current) throw new Error("Active ownership relation is missing");
    return {
      ownerPartyId: current.ownerPartyId,
      ownerName: current.ownerName,
      ownerCompanyId: companyByPartyId.get(current.ownerPartyId)?.id ?? null,
      issuerCompanyId: current.issuerCompanyId,
      shareRatio: current.shareRatio,
      previousShareRatio: pending ? confirmed?.shareRatio ?? null : null,
      isConsolidated: current.isConsolidated,
      recordStatus: pending ? "pending" : "confirmed",
      sourceIds: ordered.map((interest) => interest.id),
    };
  });
}

function edgeFromRelation(
  relation: ProjectedRelation,
  source: string,
  target: string,
  occurrencePath: number[],
): OwnershipStructureEdge {
  return {
    key: `ownership:${occurrencePath.join("/")}:${relation.ownerPartyId}:${relation.sourceIds.join("-")}`,
    source,
    target,
    shareRatio: relation.shareRatio,
    previousShareRatio: relation.previousShareRatio,
    recordStatus: relation.recordStatus,
    relationType: "ownership_interest",
    isConsolidated: relation.isConsolidated,
  };
}

function groupBy<T, K>(items: readonly T[], keyFor: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function ratio(amount: number, total: number) {
  return total > 0 ? amount / total : 0;
}

function projectedCapital(shareholder: OwnershipStructureShareholderInput) {
  return shareholder.confirmedSubscribedCapitalYuan + shareholder.pendingCapitalDeltaYuan;
}
