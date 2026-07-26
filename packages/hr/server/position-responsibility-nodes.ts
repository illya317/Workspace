import { createHash } from "crypto";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { validatePositionResponsibilityNodeSyncCommand } from "./domain/position-responsibility-node-validation";

type ResponsibilityDescription = {
  id: number;
  details: string | null;
  version: string | null;
  updatedAt: Date;
};

type ResponsibilityNodeDraft = {
  nodeKey: string;
  nodeType: "duty_group" | "duty_item";
  title: string;
  content: string;
  pathLabel: string;
  sourcePath: string;
  sourceHash: string;
  sortOrder: number;
  parentNodeKey: string | null;
};

const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export async function syncPositionDescriptionResponsibilityNodes(positionDescriptionId: number) {
  const command = validatePositionResponsibilityNodeSyncCommand({ positionDescriptionId });
  if (!command.ok) return { synced: 0, inactive: 0 };
  const description = await prisma.positionDescription.findUnique({
    where: { id: command.data.positionDescriptionId },
    select: { id: true, details: true, version: true, updatedAt: true },
  });
  if (!description) return { synced: 0, inactive: 0 };
  return prisma.$transaction((tx) => syncPositionDescriptionResponsibilityNodesInTx(tx, description));
}

export async function syncPositionDescriptionResponsibilityNodesInTx(
  tx: Prisma.TransactionClient,
  description: ResponsibilityDescription,
) {
  const command = validatePositionResponsibilityNodeSyncCommand({ positionDescriptionId: description.id });
  if (!command.ok) return { synced: 0, inactive: 0 };
  const drafts = buildResponsibilityNodeDrafts(description);
  const inactive = await tx.positionResponsibilityNode.updateMany({
    where: { positionDescriptionId: description.id, isActive: true },
    data: { isActive: false },
  });
  const groups = drafts.filter((draft) => draft.nodeType === "duty_group");
  const groupIds = new Map<string, number>();

  for (const draft of groups) {
    const node = await upsertResponsibilityNode(tx, description, draft, null);
    groupIds.set(draft.nodeKey, node.id);
  }

  for (const draft of drafts.filter((item) => item.nodeType === "duty_item")) {
    await upsertResponsibilityNode(tx, description, draft, draft.parentNodeKey ? groupIds.get(draft.parentNodeKey) ?? null : null);
  }

  return { synced: drafts.length, inactive: inactive.count };
}

function buildResponsibilityNodeDrafts(description: ResponsibilityDescription): ResponsibilityNodeDraft[] {
  const details = parseDetails(description.details);
  const duties = Array.isArray(details?.duties) ? details.duties : [];
  const drafts: ResponsibilityNodeDraft[] = [];
  const usedKeys = new Set<string>();
  let groupIndex = 0;

  duties.forEach((duty, majorIndex) => {
    const dutyRecord = asRecord(duty);
    const items = Array.isArray(dutyRecord?.items) ? dutyRecord.items : [];
    const title = normalizeText(dutyRecord?.title) || (items.length > 0 ? "主要职责" : "");
    if (!title || items.length === 0) return;
    groupIndex += 1;
    appendResponsibilityGroup({
      description,
      drafts,
      usedKeys,
      title,
      items,
      groupIndex,
      sourcePath: `details.duties[${majorIndex}]`,
      itemSourcePath: (minorIndex) => `details.duties[${majorIndex}].items[${minorIndex}]`,
    });
  });

  const managementDuties = Array.isArray(details?.managementDuties) ? details.managementDuties : [];
  if (managementDuties.length > 0) {
    groupIndex += 1;
    appendResponsibilityGroup({
      description,
      drafts,
      usedKeys,
      title: "管理职责",
      items: managementDuties,
      groupIndex,
      sourcePath: "details.managementDuties",
      itemSourcePath: (minorIndex) => `details.managementDuties[${minorIndex}]`,
    });
  }

  return drafts;
}

function appendResponsibilityGroup(input: {
  description: ResponsibilityDescription;
  drafts: ResponsibilityNodeDraft[];
  usedKeys: Set<string>;
  title: string;
  items: unknown[];
  groupIndex: number;
  sourcePath: string;
  itemSourcePath: (minorIndex: number) => string;
}) {
  const groupHash = digest(["duty_group", input.sourcePath, input.title]);
  const groupKey = uniqueNodeKey(`pd:${input.description.id}:duty-group:${groupHash.slice(0, 16)}`, input.usedKeys);
  input.drafts.push({
    nodeKey: groupKey,
    nodeType: "duty_group",
    title: input.title,
    content: "",
    pathLabel: `${chineseOrdinal(input.groupIndex)}、`,
    sourcePath: input.sourcePath,
    sourceHash: groupHash,
    sortOrder: input.groupIndex,
    parentNodeKey: null,
  });

  input.items.forEach((item, minorIndex) => {
    const content = normalizeText(item);
    if (!content) return;
    const itemSourcePath = input.itemSourcePath(minorIndex);
    const itemHash = digest(["duty_item", itemSourcePath, input.title, content]);
    input.drafts.push({
      nodeKey: uniqueNodeKey(`pd:${input.description.id}:duty-item:${itemHash.slice(0, 16)}`, input.usedKeys),
      nodeType: "duty_item",
      title: content,
      content,
      pathLabel: `${input.groupIndex}.${minorIndex + 1}`,
      sourcePath: itemSourcePath,
      sourceHash: itemHash,
      sortOrder: minorIndex,
      parentNodeKey: groupKey,
    });
  });
}

async function upsertResponsibilityNode(
  tx: Prisma.TransactionClient,
  description: ResponsibilityDescription,
  draft: ResponsibilityNodeDraft,
  parentId: number | null,
) {
  const data = {
    positionDescriptionId: description.id,
    parentId,
    nodeType: draft.nodeType,
    title: draft.title,
    content: draft.content,
    pathLabel: draft.pathLabel,
    sourcePath: draft.sourcePath,
    sourceHash: draft.sourceHash,
    descriptionVersion: description.version,
    descriptionUpdatedAt: description.updatedAt,
    sortOrder: draft.sortOrder,
    isActive: true,
  };
  return tx.positionResponsibilityNode.upsert({
    where: { nodeKey: draft.nodeKey },
    create: { nodeKey: draft.nodeKey, ...data },
    update: data,
    select: { id: true },
  });
}

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function digest(parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function uniqueNodeKey(base: string, usedKeys: Set<string>) {
  let next = base;
  let suffix = 2;
  while (usedKeys.has(next)) {
    next = `${base}:${suffix}`;
    suffix += 1;
  }
  usedKeys.add(next);
  return next;
}

function chineseOrdinal(value: number) {
  return CHINESE_NUMERALS[value - 1] || String(value);
}
