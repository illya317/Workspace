import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "@workspace/platform/types";

import { jsonErrorResponse } from "../api";
import { getSessionUserFromAuthPayload } from "../auth/session";
import { convertWecomBotOpenUserId } from "../auth/wecom";
import { prisma } from "../prisma";
import { evaluatePermissionAction } from "../rbac/action-grants";
import type { ParsedAgentRequest } from "./route-input";

const BRIDGE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const wecomAgentImageSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  base64: z.string().min(4).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});

const wecomAgentBridgeSchema = z.object({
  msgId: z.string().trim().min(1).max(256),
  userId: z.string().trim().min(1).max(256),
  chatType: z.enum(["single", "group"]),
  chatId: z.string().trim().min(1).max(256).optional().nullable(),
  message: z.string().trim().max(2000).optional().default(""),
  images: z.array(wecomAgentImageSchema).max(4).optional().default([]),
  sessionId: z.string().trim().max(80).optional().nullable(),
}).refine((input) => Boolean(input.message) || input.images.length > 0, {
  message: "message or image is required",
}).superRefine((input, context) => {
  input.images.forEach((image, index) => {
    const size = Buffer.from(image.base64, "base64").length;
    if (size <= 0 || size > MAX_IMAGE_BYTES) {
      context.addIssue({
        code: "custom",
        message: "企业微信图片大小无效",
        path: ["images", index, "base64"],
      });
    }
  });
});

export type WecomAgentBridgeInput = z.infer<typeof wecomAgentBridgeSchema>;

export type ParsedWecomAgentBridgeRequest =
  | { ok: true; input: WecomAgentBridgeInput }
  | { ok: false; response: Response };

export type ResolvedWecomAgentUser =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

export function buildWecomAgentBridgeSignature(rawBody: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function signaturesMatch(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isWecomAgentBridgeRequestAuthorized(request: Request, rawBody: string) {
  const expectedBotId = process.env.WECHAT_BOT_ID?.trim();
  const secret = process.env.WECHAT_BOT_SECRET?.trim();
  if (!expectedBotId || !secret) return false;

  const botId = request.headers.get("x-wecom-bot-id")?.trim() ?? "";
  const timestamp = request.headers.get("x-workspace-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-workspace-signature")?.trim() ?? "";
  const timestampMs = Number(timestamp);
  if (botId !== expectedBotId || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > BRIDGE_CLOCK_SKEW_MS) {
    return false;
  }

  return signaturesMatch(signature, buildWecomAgentBridgeSignature(rawBody, timestamp, secret));
}

export async function parseWecomAgentBridgeRequest(request: Request): Promise<ParsedWecomAgentBridgeRequest> {
  if (!process.env.WECHAT_BOT_ID?.trim() || !process.env.WECHAT_BOT_SECRET?.trim()) {
    return { ok: false, response: jsonErrorResponse("企业微信机器人未配置", 503) };
  }

  const rawBody = await request.text();
  if (!isWecomAgentBridgeRequestAuthorized(request, rawBody)) {
    return { ok: false, response: jsonErrorResponse("Invalid WeCom bridge authentication", 401) };
  }

  let rawInput: unknown;
  try {
    rawInput = JSON.parse(rawBody);
  } catch {
    return { ok: false, response: jsonErrorResponse("Invalid JSON body", 400) };
  }
  const parsed = wecomAgentBridgeSchema.safeParse(rawInput);
  if (!parsed.success || (parsed.data.chatType === "group" && !parsed.data.chatId)) {
    return { ok: false, response: jsonErrorResponse("Invalid WeCom agent message", 400) };
  }
  return { ok: true, input: parsed.data };
}

async function findWecomBoundUser(wxUserId: string) {
  return prisma.user.findUnique({
    where: { wxUserId },
    select: { id: true, wxUserId: true, canLogin: true, sessionVersion: true },
  });
}

export async function resolveWecomAgentUser(incomingUserId: string): Promise<ResolvedWecomAgentUser> {
  let user = await findWecomBoundUser(incomingUserId);
  if (!user) {
    const convertedUserId = await convertWecomBotOpenUserId(incomingUserId);
    if (convertedUserId) user = await findWecomBoundUser(convertedUserId);
  }
  if (!user || !user.canLogin) {
    return { ok: false, response: jsonErrorResponse("企业微信账号尚未绑定或已停用", 403) };
  }
  if (!(await evaluatePermissionAction(user.id, "agent.assistant", "submit"))) {
    return { ok: false, response: jsonErrorResponse("当前账号未开通智能体权限", 403) };
  }

  const sessionUser = await getSessionUserFromAuthPayload({
    userId: user.id,
    wxUserId: user.wxUserId ?? "",
    departmentId: 0,
    sessionVersion: user.sessionVersion,
  });
  if (!sessionUser) {
    return { ok: false, response: jsonErrorResponse("企业微信账号状态已失效", 401) };
  }
  return { ok: true, user: sessionUser };
}

export function toParsedAgentRequest(input: WecomAgentBridgeInput): ParsedAgentRequest {
  return {
    body: {
      message: input.message,
      sessionId: input.sessionId,
      agentProfileId: null,
      context: {
        contextLabel: input.chatType === "group" ? "企业微信群聊" : "企业微信私聊",
        path: input.chatType === "group" ? "wecom://group" : "wecom://single",
        title: "企业微信智能体",
      },
    },
    imageFiles: input.images.map((image) => {
      const buffer = Buffer.from(image.base64, "base64");
      if (buffer.length <= 0 || buffer.length > MAX_IMAGE_BYTES) {
        throw new Error("企业微信图片大小无效");
      }
      return new File([new Uint8Array(buffer)], image.fileName, { type: image.mimeType });
    }),
  };
}
