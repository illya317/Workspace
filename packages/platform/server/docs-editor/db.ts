import "server-only";

import { prisma } from "../prisma";

export type DocsEditorSpaceRow = {
  id: number;
  targetType: string;
  targetId: number;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DocsEditorTemplateRow = {
  id: number;
  title: string;
  type: string;
  status: string;
  ownerUserId: number | null;
  spaceId: number;
  documentContentRef: string | null;
  fieldModelContentRef: string | null;
  sourceKind: string | null;
  sourceProductKey: string | null;
  sourceStageKeys: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  publishedAt: Date | null;
  publishedByUserId: number | null;
};

export type DocsEditorSpacePermissionRow = {
  id: number;
  targetType: string;
  targetId: number;
  userId: number;
  role: string;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
};

type WriteResult = { count: number };

type Delegate<TRow> = {
  findFirst(args?: unknown): Promise<TRow | null>;
  findMany(args?: unknown): Promise<TRow[]>;
  findUnique(args?: unknown): Promise<TRow | null>;
  create(args: unknown): Promise<TRow>;
  update(args: unknown): Promise<TRow>;
  deleteMany(args: unknown): Promise<WriteResult>;
  createMany(args: unknown): Promise<WriteResult>;
  count(args?: unknown): Promise<number>;
};

export type DocsEditorDb = {
  documentTemplateSpace: Delegate<DocsEditorSpaceRow>;
  documentTemplate: Delegate<DocsEditorTemplateRow>;
  documentTemplateSpacePermission: Delegate<DocsEditorSpacePermissionRow>;
  $transaction<T>(fn: (tx: DocsEditorDb) => Promise<T>): Promise<T>;
};

export function docsEditorDb(client: unknown = prisma): DocsEditorDb {
  return client as DocsEditorDb;
}
