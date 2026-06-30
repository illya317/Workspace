import "server-only";

import { prisma } from "../prisma";

export type DocsEditorSpaceRow = {
  id: number;
  kind: string;
  title: string;
  description: string | null;
  ownerUserId: number | null;
  departmentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type DocsEditorTemplateRow = {
  id: number;
  title: string;
  type: string;
  status: string;
  ownerUserId: number;
  spaceId: number;
  documentJson: string;
  fieldModelJson: string;
  sourceKind: string | null;
  sourceProductKey: string | null;
  sourceStageKeys: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  publishRequestedAt: Date | null;
  publishedAt: Date | null;
  publishedByUserId: number | null;
};

export type DocsEditorPermissionRow = {
  id: number;
  templateId: number;
  userId: number;
  role: string;
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
  documentTemplatePermission: Delegate<DocsEditorPermissionRow>;
  $transaction<T>(fn: (tx: DocsEditorDb) => Promise<T>): Promise<T>;
};

export function docsEditorDb(client: unknown = prisma): DocsEditorDb {
  return client as DocsEditorDb;
}
