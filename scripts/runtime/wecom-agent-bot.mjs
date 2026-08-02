import "dotenv/config";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import AiBot from "@wecom/aibot-node-sdk";
import {
  controlledFileFallback,
  fileArtifactsFromResult,
  normalizeWecomReplyLinks,
} from "./wecom-agent-delivery.mjs";
import { detectWecomImageMimeType, readWecomAgentInput } from "./wecom-agent-input.mjs";
import { forwardSafeAgentProgress, readAgentEventStream } from "./wecom-agent-stream.mjs";
import {
  createWecomNotificationDeliveryWorker,
  resolveWecomNotificationRedirectOrigin,
} from "./wecom-notification-delivery.mjs";

const botId = process.env.WECHAT_BOT_ID?.trim();
const botSecret = process.env.WECHAT_BOT_SECRET?.trim();
if (!botId || !botSecret) {
  console.error("[wecom-agent] WECHAT_BOT_ID and WECHAT_BOT_SECRET are required");
  process.exit(1);
}
const workerBridgeSecret = process.env.WECOM_WORKER_BRIDGE_SECRET?.trim();
if (!workerBridgeSecret || workerBridgeSecret.length < 32) {
  console.error("[wecom-agent] WECOM_WORKER_BRIDGE_SECRET must contain at least 32 characters");
  process.exit(1);
}
let redirectOrigin;
try {
  redirectOrigin = resolveWecomNotificationRedirectOrigin(process.env);
} catch (error) {
  console.error(`[wecom-agent] public origin is invalid: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const port = process.env.PORT || "3000";
const bridgeUrl = process.env.WECHAT_BOT_BRIDGE_URL || `http://127.0.0.1:${port}${basePath}/api/integrations/wecom/agent`;
const configDir = process.env.WORKSPACE_CONFIG_DIR || path.join(process.cwd(), ".workspace");
const statePath = path.join(configDir, "agent", "wecom-bot-state.json");
const MAX_RECENT_MESSAGE_IDS = 500;
const MAX_REPLY_BYTES = 20_000;
const MAX_DIRECT_FILE_BYTES = 45 * 1024 * 1024;
const MAX_RICH_IMAGE_BYTES = 10 * 1024 * 1024;
const ARTIFACT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const AGENT_TURN_TIMEOUT_MS = 16 * 60 * 1000;
const STREAM_UPDATE_INTERVAL_MS = 700;

function safeLogMessage(message) {
  return String(message)
    .replace(/media_id=[^,\s]+/gi, "media_id=[redacted]")
    .replace(/upload_id=[^,\s]+/gi, "upload_id=[redacted]");
}

const logger = {
  debug() {},
  info(message) { console.log(`[wecom-agent] ${safeLogMessage(message)}`); },
  warn(message) { console.warn(`[wecom-agent] ${safeLogMessage(message)}`); },
  error(message) { console.error(`[wecom-agent] ${safeLogMessage(message)}`); },
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

async function callWorkspaceAgent(payload, onEvent) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AGENT_TURN_TIMEOUT_MS);
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
    return readAgentEventStream(response, onEvent);
  } finally {
    clearTimeout(timeout);
  }
}

function createStreamReply(frame, streamId) {
  let chain = Promise.resolve();
  let latest = "正在处理…";
  let timer;
  let closed = false;

  function queueSend(content, finish, msgItems) {
    const operation = chain.then(() => client.replyStream(
      frame,
      streamId,
      limitReply(content),
      finish,
      finish ? msgItems : undefined,
    ));
    chain = operation.catch((error) => {
      console.error(`[wecom-agent] stream update failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    return operation;
  }

  function schedule(content) {
    if (closed) return;
    latest = content || latest;
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void queueSend(latest, false).catch(() => undefined);
    }, STREAM_UPDATE_INTERVAL_MS);
  }

  return {
    async start(content) {
      latest = content;
      await queueSend(latest, false);
    },
    update: schedule,
    touch() {
      if (closed || timer) return;
      void queueSend(latest, false).catch(() => undefined);
    },
    async finish(content, msgItems) {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      await chain;
      await queueSend(content || latest, true, msgItems);
    },
  };
}

async function fetchWorkspaceArtifact(artifact) {
  const url = new URL(artifact.workerPath, bridgeUrl);
  const timestamp = String(Date.now());
  const response = await fetch(url, {
    headers: {
      "x-wecom-bot-id": botId,
      "x-workspace-timestamp": timestamp,
      "x-workspace-signature": signature("", timestamp),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Artifact HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length <= 0 || buffer.length > MAX_DIRECT_FILE_BYTES) {
    throw new Error(`Artifact size ${buffer.length} is outside the direct-send limit`);
  }
  return buffer;
}

async function cleanupExpiredArtifacts() {
  const url = new URL(`${basePath}/api/integrations/wecom/agent/artifacts/cleanup`, bridgeUrl);
  const timestamp = String(Date.now());
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-wecom-bot-id": botId,
      "x-workspace-timestamp": timestamp,
      "x-workspace-signature": signature("", timestamp),
    },
  });
  if (!response.ok) throw new Error(`Artifact cleanup HTTP ${response.status}`);
  return response.json();
}

async function deliverFileArtifacts(frame, artifacts) {
  const fallback = [];
  const richImages = [];
  let sentCount = 0;
  for (const artifact of artifacts) {
    if (artifact.fileSizeBytes > MAX_DIRECT_FILE_BYTES) {
      fallback.push({ artifact, reason: "超过企业微信直传大小限制" });
      continue;
    }
    try {
      const buffer = await fetchWorkspaceArtifact(artifact);
      let imageMimeType = null;
      try {
        imageMimeType = detectWecomImageMimeType(buffer);
      } catch {
        // Non-image library artifacts continue through file delivery.
      }
      if (richImages.length < 10
        && buffer.length <= MAX_RICH_IMAGE_BYTES
        && (imageMimeType === "image/png" || imageMimeType === "image/jpeg")) {
        richImages.push({
          msgtype: "image",
          image: {
            base64: buffer.toString("base64"),
            md5: createHash("md5").update(buffer).digest("hex"),
          },
        });
        sentCount += artifact.itemCount;
        continue;
      }
      const mediaType = imageMimeType ? "image" : "file";
      const uploaded = await client.uploadMedia(buffer, { type: mediaType, filename: artifact.fileName });
      await client.replyMedia(frame, mediaType, uploaded.media_id);
      sentCount += artifact.itemCount;
    } catch (error) {
      console.error(`[wecom-agent] file delivery failed: ${error instanceof Error ? error.message : String(error)}`);
      fallback.push({ artifact, reason: "企业微信文件上传暂时失败" });
    }
  }
  if (fallback.length > 0) {
    return {
      message: controlledFileFallback(fallback, redirectOrigin, sentCount),
      richImages,
    };
  }
  return { message: `已按你的当前权限直接发送 ${sentCount} 份原始资料。`, richImages };
}

const client = new AiBot.WSClient({
  botId,
  secret: botSecret,
  maxReconnectAttempts: -1,
  maxAuthFailureAttempts: 5,
  logger,
});
const notificationDelivery = createWecomNotificationDeliveryWorker({
  client,
  bridgeUrl,
  bridgeSecret: workerBridgeSecret,
  redirectOrigin,
  basePath,
  logger,
});
let shuttingDown = false;

const cleanupTimer = setInterval(() => {
  void cleanupExpiredArtifacts().catch((error) => {
    console.error(`[wecom-agent] artifact cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}, ARTIFACT_CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
void cleanupExpiredArtifacts().catch((error) => {
  console.error(`[wecom-agent] startup artifact cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
});

async function handleMessage(frame) {
  const body = frame.body;
  if (!body?.msgid || !body.from?.userid || !rememberMessage(body.msgid)) return;
  await saveState();

  const streamId = `workspace-${randomUUID()}`;
  const replyStream = createStreamReply(frame, streamId);
  try {
    await replyStream.start(body.msgtype === "image" || body.msgtype === "mixed" ? "正在接收图片…" : "正在处理…");
    const input = await readWecomAgentInput(client, frame);
    const message = stripRobotMention(input.message, body.chattype);
    if (!message && input.images.length === 0) {
      await replyStream.finish("请告诉我你想了解什么。");
      return;
    }

    const key = sessionKey(body);
    const result = await callWorkspaceAgent({
      msgId: body.msgid,
      userId: body.from.userid,
      chatType: body.chattype || "single",
      chatId: body.chatid || null,
      message,
      images: input.images,
      sessionId: state.sessions[key] || null,
    }, (event) => forwardSafeAgentProgress(event, replyStream));
    if (result.session?.id) {
      state.sessions[key] = result.session.id;
      await saveState();
    }
    let reply = result.message || "";
    let replyImages = [];
    const artifacts = fileArtifactsFromResult(result, basePath);
    if (body.chattype !== "group" && artifacts.length > 0) {
      const delivered = await deliverFileArtifacts(frame, artifacts);
      reply = delivered.message;
      replyImages = delivered.richImages;
    } else if (result.type === "proposal") {
      reply = `${reply}\n\n涉及变更，请到 Workspace 网页端确认后执行。`;
    }
    await replyStream.finish(
      normalizeWecomReplyLinks(reply, redirectOrigin, basePath),
      replyImages,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    console.error(`[wecom-agent] message processing failed: ${message}`);
    await replyStream.finish(`暂时无法处理：${message}`).catch(() => undefined);
  }
}

client.on("authenticated", () => {
  console.log("[wecom-agent] authenticated");
  if (!shuttingDown) notificationDelivery.start();
});
client.on("reconnecting", (attempt) => console.warn(`[wecom-agent] reconnecting attempt=${attempt}`));
client.on("disconnected", (reason) => {
  console.warn(`[wecom-agent] disconnected: ${reason}`);
  void notificationDelivery.stop().catch(() => {
    console.warn("[wecom-agent] notification worker stop failed");
  });
});
client.on("error", (error) => console.error(`[wecom-agent] socket error: ${error.message}`));
client.on("message.text", (frame) => void handleMessage(frame));
client.on("message.voice", (frame) => void handleMessage(frame));
client.on("message.image", (frame) => void handleMessage(frame));
client.on("message.mixed", (frame) => void handleMessage(frame));
client.on("event.enter_chat", (frame) => {
  void client.replyWelcome(frame, {
    msgtype: "text",
    text: { content: "你好，我是 Workspace 智能体。私聊按你的 Workspace 权限提供服务；群聊仅提供不读取业务数据的普通问答。" },
  }).catch((error) => console.error(`[wecom-agent] welcome failed: ${error.message}`));
});

let shutdownPromise;
function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  console.log(`[wecom-agent] received ${signal}, draining notification delivery`);
  clearInterval(cleanupTimer);
  const forceTimer = setTimeout(() => {
    console.error("[wecom-agent] graceful shutdown timed out");
    client.disconnect();
    process.exit(1);
  }, 15_000);
  forceTimer.unref();
  shutdownPromise = (async () => {
    await notificationDelivery.stop().catch(() => {
      console.warn("[wecom-agent] notification worker graceful stop failed");
    });
    client.disconnect();
    clearTimeout(forceTimer);
    process.exitCode = 0;
  })();
  return shutdownPromise;
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (error) => {
  console.error(`[wecom-agent] unhandled rejection: ${error instanceof Error ? error.message : String(error)}`);
});

client.connect();
