import "server-only";

import { z } from "zod";

import { jsonErrorResponse } from "@workspace/platform/server/api";
import { isWecomAgentBridgeRequestAuthorized } from "@workspace/platform/server/wecom-agent-bridge-auth";

import type { ParsedAgentRequest } from "./route-input";

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
