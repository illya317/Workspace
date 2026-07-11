import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "@workspace/platform/types";

import { defaultAgentModelProvider } from "./model/default";
import type { AgentInputImage, HistoryMessage } from "./model/provider";

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
const SUMMARY_LONG_CHARS = 6_000;
const SUMMARY_INPUT_CHARS = 24_000;
const COMPRESSION_TRIGGER_CHARS = 24_000;
const RECENT_HISTORY_MESSAGES = 16;
const HISTORY_MESSAGE_CHARS = 2_000;
const MAX_STORED_MESSAGE_CHARS = 32_000;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SESSION_ID_PATTERN = /^sess_[a-f0-9]{32}$/;
const IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

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

function assetPath(storageKey: string) {
  return path.join(agentDataRoot(), storageKey);
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

function safeAssetBaseName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "image";
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.length > 3;
  if (mimeType === "image/gif") return buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a";
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
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
  if (files.length > MAX_IMAGE_ATTACHMENTS) {
    throw new Error(`一次最多上传 ${MAX_IMAGE_ATTACHMENTS} 张图片`);
  }

  const now = Date.now();
  const images: AgentInputImage[] = [];
  for (const file of files) {
    const extension = IMAGE_TYPES.get(file.type);
    if (!extension) {
      throw new Error("仅支持 PNG、JPG、WEBP 或 GIF 图片");
    }
    if (file.size <= 0) {
      throw new Error("图片文件为空");
    }
    if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
      throw new Error("单张图片不能超过 5MB");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedImageSignature(buffer, file.type)) {
      throw new Error("图片内容与文件类型不匹配");
    }

    const id = `img_${randomUUID().replace(/-/g, "")}`;
    const fileName = `${id}-${safeAssetBaseName(file.name)}.${extension}`;
    const storageKey = path.posix.join(session.storageKey, "assets", fileName);
    const fullPath = assetPath(storageKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);

    images.push({
      id,
      fileName: file.name || `image-${now}.${extension}`,
      mimeType: file.type,
      size: file.size,
      storageKey,
      dataUrl: `data:${file.type};base64,${buffer.toString("base64")}`,
    });
  }

  return images;
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
      content: `历史摘要（压缩）：\n${truncateText(prepared.summaryLong, SUMMARY_LONG_CHARS)}`,
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

  for (const message of sourceMessages.slice(-RECENT_HISTORY_MESSAGES)) {
    history.push({
      role: message.role,
      content: truncateText(storedMessageText(message), HISTORY_MESSAGE_CHARS),
    });
  }

  return history;
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
  if (session.byteSize < COMPRESSION_TRIGGER_CHARS) return session;

  const messages = await readAgentSessionMessages(session);
  const compactableCount = Math.max(0, messages.length - RECENT_HISTORY_MESSAGES);
  if (compactableCount <= session.compactedMessageCount) return session;

  const previousSummary = await readAgentSessionSummary(session);
  const delta = messages.slice(session.compactedMessageCount, compactableCount);
  const nextSummary = await summarizeMessages(previousSummary, delta);
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

async function summarizeMessages(previousSummary: string | null, messages: AgentStoredMessage[]) {
  const inputText = [
    previousSummary ? `既有摘要：\n${previousSummary}` : "",
    messages.map((message) => `${message.role === "user" ? "用户" : "助手"}：${storedMessageText(message)}`).join("\n\n"),
  ].filter(Boolean).join("\n\n");

  const compactInput = truncateText(inputText, SUMMARY_INPUT_CHARS);
  try {
    const summary = await defaultAgentModelProvider.summarizeResult({
      toolLabel: "AgentSessionCompaction",
      query: "压缩内部页面助手会话历史，保留对后续回答有用的信息。",
      result: { transcript: compactInput },
    }, `你在压缩内部管理系统页面助手的会话历史。
输出要求：
- 不超过 ${SUMMARY_LONG_CHARS} 个中文字符。
- 保留用户目标、已确认决策、当前页面/模块、关键源码路径、业务规则、未完成事项、proposal/PR 状态、拒答边界。
- 删除寒暄、重复内容和已过期工具结果。
- 不要编造没有出现过的事实。`);
    return truncateText(summary, SUMMARY_LONG_CHARS);
  } catch {
    return fallbackSummary(previousSummary, messages);
  }
}

function fallbackSummary(previousSummary: string | null, messages: AgentStoredMessage[]) {
  const lines = messages.map((message) => {
    const prefix = message.role === "user" ? "用户" : "助手";
    return `- ${prefix}: ${truncateText(storedMessageText(message).replace(/\s+/g, " "), 240)}`;
  });
  return truncateText([previousSummary, "近期压缩记录：", ...lines].filter(Boolean).join("\n"), SUMMARY_LONG_CHARS);
}
