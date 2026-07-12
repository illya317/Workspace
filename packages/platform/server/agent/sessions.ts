import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentInputImage, HistoryMessage } from "./model/provider";
import { AGENT_SESSION_SUMMARY_CHARS, summarizeAgentSessionHistory } from "./session-summary";
import { storeAgentSessionImagesAt } from "./session-images";

export type AgentStoredMessageRole = "user" | "agent";

export type AgentStoredAttachment = {
  id: string;
  type: "image";
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
};

export type AgentSessionContextInput = {
  sessionId?: string | null;
  contextLabel?: string | null;
  path?: string | null;
  title?: string | null;
};

export type AgentPageSourceContextInput = Partial<Record<
  "navigationLabel" | "activeKey" | "activeLabel" | "activeChildKey" | "activeChildLabel",
  string | null
>>;

export type AgentMessageContextInput = AgentSessionContextInput & { sourceContext?: AgentPageSourceContextInput };

export type AgentStoredMessage = {
  id: string;
  role: AgentStoredMessageRole;
  content: string;
  createdAt: string;
  responseType?: "answer" | "error" | "clarification" | "proposal";
  attachments?: AgentStoredAttachment[];
  proposal?: {
    id: number;
    actionKey: string;
    targetType: string;
    targetId?: string;
    diff: Record<string, unknown>;
  };
  proposalStatus?: "pending" | "confirmed" | "cancelled";
};

export type AgentSessionRow = {
  id: string;
  userId: number;
  status: string;
  pagePath: string | null;
  contextLabel: string | null;
  title: string | null;
  storageKey: string;
  summaryShort: string | null;
  summaryLongStorageKey: string | null;
  messageCount: number;
  compactedMessageCount: number;
  byteSize: number;
};

export type PreparedAgentSession = {
  session: AgentSessionRow;
  messages: AgentStoredMessage[];
  summaryLong: string | null;
};

const SUMMARY_SHORT_CHARS = 1_200;
const MODEL_HISTORY_CHARS = 160_000;
const COMPRESSION_TRIGGER_BYTES = MODEL_HISTORY_CHARS;
const MAX_STORED_MESSAGE_CHARS = MODEL_HISTORY_CHARS;
const SESSION_ID_PATTERN = /^sess_[a-f0-9]{32}$/;

let schemaReady = false;

function expandTilde(input: string) {
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function workspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured) return expandTilde(configured);
  return path.join(os.tmpdir(), "workspace");
}

function agentDataRoot() {
  const configured = process.env.AGENT_DATA_DIR?.trim();
  const root = configured ? expandTilde(configured) : path.join(workspaceConfigDir(), "agent");
  return path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
}

function createSessionId() {
  return `sess_${randomUUID().replace(/-/g, "")}`;
}

function storageKeyFor(sessionId: string, now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return path.posix.join("sessions", year, month, sessionId);
}

function sessionDir(storageKey: string) {
  return path.join(agentDataRoot(), storageKey);
}

function messagesPath(storageKey: string) {
  return path.join(sessionDir(storageKey), "messages.jsonl");
}

function summaryPath(storageKey: string) {
  return path.join(sessionDir(storageKey), "summary.md");
}

function truncateText(value: string | null | undefined, max: number) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 12).trimEnd()}\n[truncated]`;
}

function normalizeOptionalText(value: string | null | undefined, max: number) {
  const text = truncateText(value, max);
  return text || null;
}

function isMissingFileError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}

function attachmentLabel(attachment: AgentStoredAttachment) {
  const kb = Math.max(1, Math.round(attachment.size / 1024));
  return `${attachment.fileName} (${attachment.mimeType}, ${kb}KB)`;
}

function storedMessageText(message: Pick<AgentStoredMessage, "content" | "attachments">) {
  const attachmentText = message.attachments?.length
    ? `\n[图片附件：${message.attachments.map(attachmentLabel).join("；")}]`
    : "";
  return `${message.content}${attachmentText}`;
}

async function ensureAgentSessionSchema() {
  if (schemaReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AgentSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'active',
      "pagePath" TEXT,
      "contextLabel" TEXT,
      "title" TEXT,
      "storageKey" TEXT NOT NULL,
      "summaryShort" TEXT,
      "summaryLongStorageKey" TEXT,
      "messageCount" INTEGER NOT NULL DEFAULT 0,
      "compactedMessageCount" INTEGER NOT NULL DEFAULT 0,
      "byteSize" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" DATETIME,
      "deletedAt" DATETIME
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentSession_userId_updatedAt_idx" ON "AgentSession"("userId", "updatedAt")`);

  const proposalColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("AgentProposal")`);
  if (!proposalColumns.some((column) => column.name === "sessionId")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "AgentProposal" ADD COLUMN "sessionId" TEXT`);
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentProposal_sessionId_idx" ON "AgentProposal"("sessionId")`);

  schemaReady = true;
}

function normalizeSessionRows(rows: AgentSessionRow[]) {
  return rows.map((row) => ({
    ...row,
    messageCount: Number(row.messageCount ?? 0),
    compactedMessageCount: Number(row.compactedMessageCount ?? 0),
    byteSize: Number(row.byteSize ?? 0),
  }));
}

async function getSessionById(sessionId: string, user: SessionUser) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  const rows = await prisma.$queryRawUnsafe<AgentSessionRow[]>(
    `SELECT "id", "userId", "status", "pagePath", "contextLabel", "title", "storageKey", "summaryShort",
            "summaryLongStorageKey", "messageCount", "compactedMessageCount", "byteSize"
       FROM "AgentSession"
      WHERE "id" = ? AND "userId" = ? AND "deletedAt" IS NULL
      LIMIT 1`,
    sessionId,
    user.id,
  );
  return normalizeSessionRows(rows)[0] ?? null;
}

async function createSession(user: SessionUser, input: AgentSessionContextInput) {
  const now = new Date();
  const sessionId = createSessionId();
  const storageKey = storageKeyFor(sessionId, now);
  const pagePath = normalizeOptionalText(input.path, 500);
  const contextLabel = normalizeOptionalText(input.contextLabel, 300);
  const title = normalizeOptionalText(input.title, 300);

  await mkdir(sessionDir(storageKey), { recursive: true });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "AgentSession" ("id", "userId", "status", "pagePath", "contextLabel", "title", "storageKey", "createdAt", "updatedAt")
     VALUES (?, ?, 'active', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    sessionId,
    user.id,
    pagePath,
    contextLabel,
    title,
    storageKey,
  );

  const session = await getSessionById(sessionId, user);
  if (!session) throw new Error("Agent session create failed");
  return session;
}

async function updateSessionContext(session: AgentSessionRow, input: AgentSessionContextInput, user: SessionUser) {
  const pagePath = normalizeOptionalText(input.path, 500);
  const contextLabel = normalizeOptionalText(input.contextLabel, 300);
  const title = normalizeOptionalText(input.title, 300);
  if (pagePath === session.pagePath && contextLabel === session.contextLabel && title === session.title) return session;

  await prisma.$executeRawUnsafe(
    `UPDATE "AgentSession"
        SET "pagePath" = COALESCE(?, "pagePath"),
            "contextLabel" = COALESCE(?, "contextLabel"),
            "title" = COALESCE(?, "title"),
            "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ? AND "userId" = ?`,
    pagePath,
    contextLabel,
    title,
    session.id,
    user.id,
  );

  return (await getSessionById(session.id, user)) ?? session;
}

export async function prepareAgentSession(user: SessionUser, input: AgentSessionContextInput): Promise<PreparedAgentSession> {
  await ensureAgentSessionSchema();

  const existing = input.sessionId ? await getSessionById(input.sessionId, user) : null;
  const session = existing
    ? await updateSessionContext(existing, input, user)
    : await createSession(user, input);

  return {
    session,
    messages: await readAgentSessionMessages(session),
    summaryLong: await readAgentSessionSummary(session),
  };
}

export async function readAgentSessionMessages(session: AgentSessionRow): Promise<AgentStoredMessage[]> {
  let content = "";
  try {
    content = await readFile(messagesPath(session.storageKey), "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as AgentStoredMessage;
        if (parsed.role !== "user" && parsed.role !== "agent") return [];
        if (typeof parsed.content !== "string") return [];
        return [parsed];
      } catch {
        return [];
      }
    });
}

export async function readAgentSessionSummary(session: AgentSessionRow) {
  if (!session.summaryLongStorageKey) return null;
  try {
    return await readFile(path.join(agentDataRoot(), session.summaryLongStorageKey), "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    return null;
  }
}

export async function storeAgentSessionImages(session: AgentSessionRow, files: File[]): Promise<AgentInputImage[]> {
  return storeAgentSessionImagesAt(agentDataRoot(), session.storageKey, files);
}

export function toStoredImageAttachment(image: AgentInputImage): AgentStoredAttachment {
  if (!image.storageKey) throw new Error("Agent image storage key missing");
  return {
    id: image.id,
    type: "image",
    fileName: image.fileName,
    mimeType: image.mimeType,
    size: image.size,
    storageKey: image.storageKey,
  };
}

export function buildAgentHistory(prepared: PreparedAgentSession, fallbackHistory?: HistoryMessage[]): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  if (prepared.summaryLong) {
    history.push({
      role: "agent",
      content: `历史摘要（压缩）：\n${truncateText(prepared.summaryLong, AGENT_SESSION_SUMMARY_CHARS)}`,
    });
  }

  const sourceMessages = prepared.messages.length > 0
    ? prepared.messages
    : (fallbackHistory ?? []).map((message) => ({
        id: createSessionId(),
        role: message.role,
        content: message.content,
        createdAt: new Date().toISOString(),
      } satisfies AgentStoredMessage));
  const compactedStart = prepared.messages.length > 0 && prepared.summaryLong
    ? Math.min(prepared.session.compactedMessageCount, sourceMessages.length)
    : 0;
  const historyStart = Math.max(compactedStart, modelHistoryStartIndex(sourceMessages));

  for (const message of sourceMessages.slice(historyStart)) {
    history.push({
      role: message.role,
      content: modelHistoryMessageText(message),
    });
  }

  return history;
}

function modelHistoryMessageText(message: Pick<AgentStoredMessage, "content" | "attachments">) {
  return truncateText(storedMessageText(message), MAX_STORED_MESSAGE_CHARS);
}

function modelHistoryStartIndex(messages: Array<Pick<AgentStoredMessage, "content" | "attachments">>) {
  let usedChars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const nextChars = modelHistoryMessageText(messages[index]).length;
    if (usedChars + nextChars > MODEL_HISTORY_CHARS) return index + 1;
    usedChars += nextChars;
  }
  return 0;
}

export async function appendAgentSessionMessage(
  session: AgentSessionRow,
  input: Omit<AgentStoredMessage, "id" | "createdAt">,
  user: SessionUser,
) {
  await ensureAgentSessionSchema();
  const stored: AgentStoredMessage = {
    ...input,
    id: `msg_${randomUUID().replace(/-/g, "")}`,
    content: truncateText(input.content, MAX_STORED_MESSAGE_CHARS),
    createdAt: new Date().toISOString(),
  };
  const line = `${JSON.stringify(stored)}\n`;
  const bytes = Buffer.byteLength(line, "utf8");

  await mkdir(sessionDir(session.storageKey), { recursive: true });
  await appendFile(messagesPath(session.storageKey), line, "utf8");
  await prisma.$executeRawUnsafe(
    `UPDATE "AgentSession"
        SET "messageCount" = "messageCount" + 1,
            "byteSize" = "byteSize" + ?,
            "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ? AND "userId" = ?`,
    bytes,
    session.id,
    user.id,
  );

  return (await getSessionById(session.id, user)) ?? session;
}

function contextText(value: string | null | undefined) {
  return String(value || "").trim();
}

export function buildContextualAgentMessage(question: string, session: AgentSessionRow, requestContext?: AgentMessageContextInput) {
  const context = session.contextLabel || session.title || session.pagePath;
  const path = contextText(requestContext?.path) || contextText(session.pagePath);
  const sourceContext = requestContext?.sourceContext;
  const sourceLines = [
    "页面源码定位：",
    path ? `- path: ${path}` : "",
    contextText(sourceContext?.navigationLabel) ? `- navigation: ${contextText(sourceContext?.navigationLabel)}` : "",
    contextText(sourceContext?.activeKey) || contextText(sourceContext?.activeLabel)
      ? `- activeTab: ${contextText(sourceContext?.activeKey) || "(none)"}${contextText(sourceContext?.activeLabel) ? ` (${contextText(sourceContext?.activeLabel)})` : ""}`
      : "",
    contextText(sourceContext?.activeChildKey) || contextText(sourceContext?.activeChildLabel)
      ? `- activeChild: ${contextText(sourceContext?.activeChildKey) || "(none)"}${contextText(sourceContext?.activeChildLabel) ? ` (${contextText(sourceContext?.activeChildLabel)})` : ""}`
      : "",
    "- rule: 回答页面实现问题时，先按 route page 和 import graph 定位当前 tab 对应的 TSX/TS，再扩散搜索。",
  ].filter(Boolean);
  if (!context && sourceLines.length <= 2) return question;
  return [
    context ? `当前页面：${context}` : "",
    ...sourceLines,
    `用户问题：${question}`,
  ].filter(Boolean).join("\n");
}

export async function linkAgentProposalToSession(proposalId: number | undefined, session: AgentSessionRow, user: SessionUser) {
  if (!proposalId) return;
  await ensureAgentSessionSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE "AgentProposal" SET "sessionId" = ? WHERE "id" = ? AND "userId" = ?`,
    session.id,
    proposalId,
    user.id,
  );
}

export async function compactAgentSessionIfNeeded(session: AgentSessionRow, user: SessionUser) {
  if (session.byteSize < COMPRESSION_TRIGGER_BYTES) return session;

  const messages = await readAgentSessionMessages(session);
  const compactableCount = modelHistoryStartIndex(messages);
  if (compactableCount <= session.compactedMessageCount) return session;

  const previousSummary = await readAgentSessionSummary(session);
  const delta = messages.slice(session.compactedMessageCount, compactableCount);
  const nextSummary = await summarizeAgentSessionHistory(previousSummary, delta.map((message) => ({
    role: message.role,
    content: modelHistoryMessageText(message),
  })));
  const summaryStorageKey = path.posix.join(session.storageKey, "summary.md");

  await mkdir(sessionDir(session.storageKey), { recursive: true });
  await writeFile(summaryPath(session.storageKey), nextSummary, "utf8");
  await prisma.$executeRawUnsafe(
    `UPDATE "AgentSession"
        SET "summaryShort" = ?,
            "summaryLongStorageKey" = ?,
            "compactedMessageCount" = ?,
            "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ? AND "userId" = ?`,
    truncateText(nextSummary, SUMMARY_SHORT_CHARS),
    summaryStorageKey,
    compactableCount,
    session.id,
    user.id,
  );

  return (await getSessionById(session.id, user)) ?? session;
}
