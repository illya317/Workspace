import "dotenv/config";

import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import AiBot from "@wecom/aibot-node-sdk";

const botId = process.env.WECHAT_BOT_ID?.trim();
const botSecret = process.env.WECHAT_BOT_SECRET?.trim();
if (!botId || !botSecret) {
  console.error("[wecom-agent] WECHAT_BOT_ID and WECHAT_BOT_SECRET are required");
  process.exit(1);
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const port = process.env.PORT || "3000";
const bridgeUrl = process.env.WECHAT_BOT_BRIDGE_URL || `http://127.0.0.1:${port}${basePath}/api/integrations/wecom/agent`;
const configDir = process.env.WORKSPACE_CONFIG_DIR || path.join(process.cwd(), ".workspace");
const statePath = path.join(configDir, "agent", "wecom-bot-state.json");
const MAX_RECENT_MESSAGE_IDS = 500;
const MAX_REPLY_BYTES = 20_000;

const logger = {
  debug() {},
  info(message) { console.log(`[wecom-agent] ${message}`); },
  warn(message) { console.warn(`[wecom-agent] ${message}`); },
  error(message) { console.error(`[wecom-agent] ${message}`); },
};

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    return {
      sessions: parsed && typeof parsed.sessions === "object" ? parsed.sessions : {},
      recentMessageIds: Array.isArray(parsed?.recentMessageIds) ? parsed.recentMessageIds.slice(-MAX_RECENT_MESSAGE_IDS) : [],
    };
  } catch {
    return { sessions: {}, recentMessageIds: [] };
  }
}

const state = await loadState();
const recentMessageIds = new Set(state.recentMessageIds);

async function saveState() {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({
    version: 1,
    sessions: state.sessions,
    recentMessageIds: [...recentMessageIds].slice(-MAX_RECENT_MESSAGE_IDS),
  })}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, statePath);
}

function rememberMessage(msgId) {
  if (recentMessageIds.has(msgId)) return false;
  recentMessageIds.add(msgId);
  while (recentMessageIds.size > MAX_RECENT_MESSAGE_IDS) {
    recentMessageIds.delete(recentMessageIds.values().next().value);
  }
  return true;
}

function sessionKey(body) {
  return body.chattype === "group"
    ? `group:${body.chatid}:${body.from.userid}`
    : `single:${body.from.userid}`;
}

function stripRobotMention(content, chatType) {
  const text = String(content || "").trim();
  return chatType === "group" ? text.replace(/^@\S+\s*/u, "").trim() : text;
}

function limitReply(content) {
  let output = String(content || "处理完成，但没有可显示的回复。");
  while (Buffer.byteLength(output, "utf8") > MAX_REPLY_BYTES) output = output.slice(0, -256);
  return output;
}

function signature(rawBody, timestamp) {
  return createHmac("sha256", botSecret).update(`${timestamp}.${rawBody}`).digest("hex");
}

async function callWorkspaceAgent(payload) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wecom-bot-id": botId,
        "x-workspace-timestamp": timestamp,
        "x-workspace-signature": signature(rawBody, timestamp),
      },
      body: rawBody,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Workspace HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

const client = new AiBot.WSClient({
  botId,
  secret: botSecret,
  maxReconnectAttempts: -1,
  maxAuthFailureAttempts: 5,
  logger,
});

async function handleMessage(frame, rawContent) {
  const body = frame.body;
  if (!body?.msgid || !body.from?.userid || !rememberMessage(body.msgid)) return;
  await saveState();

  const message = stripRobotMention(rawContent, body.chattype);
  const streamId = `workspace-${randomUUID()}`;
  if (!message) {
    await client.replyStream(frame, streamId, "请告诉我你想了解什么。", true);
    return;
  }

  await client.replyStream(frame, streamId, "正在处理…", false);
  try {
    const key = sessionKey(body);
    const result = await callWorkspaceAgent({
      msgId: body.msgid,
      userId: body.from.userid,
      chatType: body.chattype || "single",
      chatId: body.chatid || null,
      message,
      sessionId: state.sessions[key] || null,
    });
    if (result.session?.id) {
      state.sessions[key] = result.session.id;
      await saveState();
    }
    const suffix = result.type === "proposal" ? "\n\n涉及变更，请到 Workspace 网页端确认后执行。" : "";
    await client.replyStream(frame, streamId, limitReply(`${result.message || ""}${suffix}`), true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    console.error(`[wecom-agent] message processing failed: ${message}`);
    await client.replyStream(frame, streamId, limitReply(`暂时无法处理：${message}`), true).catch(() => undefined);
  }
}

client.on("authenticated", () => console.log("[wecom-agent] authenticated"));
client.on("reconnecting", (attempt) => console.warn(`[wecom-agent] reconnecting attempt=${attempt}`));
client.on("disconnected", (reason) => console.warn(`[wecom-agent] disconnected: ${reason}`));
client.on("error", (error) => console.error(`[wecom-agent] socket error: ${error.message}`));
client.on("message.text", (frame) => void handleMessage(frame, frame.body?.text?.content));
client.on("message.voice", (frame) => void handleMessage(frame, frame.body?.voice?.content));
client.on("event.enter_chat", (frame) => {
  void client.replyWelcome(frame, {
    msgtype: "text",
    text: { content: "你好，我是 Workspace 智能助手。私聊按你的 Workspace 权限提供服务；群聊仅提供不读取业务数据的普通问答。" },
  }).catch((error) => console.error(`[wecom-agent] welcome failed: ${error.message}`));
});

function shutdown(signal) {
  console.log(`[wecom-agent] received ${signal}, disconnecting`);
  client.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  console.error(`[wecom-agent] unhandled rejection: ${error instanceof Error ? error.message : String(error)}`);
});

client.connect();
