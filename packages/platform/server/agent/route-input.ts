import { z } from "zod";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const agentMessageSchema = z.object({
  message: z.string().trim().max(2000).optional().default(""),
  sessionId: z.string().trim().max(80).optional().nullable(),
  agentProfileId: z.number().int().positive().optional().nullable().default(null),
  context: z.object({
    contextLabel: z.string().trim().max(300).optional().nullable(),
    path: z.string().trim().max(500).optional().nullable(),
    title: z.string().trim().max(300).optional().nullable(),
    sourceContext: z.object({
      navigationLabel: z.string().trim().max(120).optional().nullable(),
      activeKey: z.string().trim().max(120).optional().nullable(),
      activeLabel: z.string().trim().max(120).optional().nullable(),
      activeChildKey: z.string().trim().max(120).optional().nullable(),
      activeChildLabel: z.string().trim().max(120).optional().nullable(),
    }).optional(),
  }).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "agent"]),
    content: z.string(),
  })).optional(),
});

export type AgentRequestBody = z.infer<typeof agentMessageSchema>;
export type ParsedAgentRequest = { body: AgentRequestBody; imageFiles: File[] };

function isUploadFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export async function parseAgentRequest(request: Request): Promise<
  | ({ ok: true } & ParsedAgentRequest)
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get("content-type") || "";
  let rawBody: unknown;
  let imageFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return { ok: false, response: jsonErrorResponse("Invalid form body", 400) };

    const payload = formData.get("payload");
    if (typeof payload === "string" && payload.trim()) {
      try {
        rawBody = JSON.parse(payload);
      } catch {
        return { ok: false, response: jsonErrorResponse("Invalid payload JSON", 400) };
      }
    } else {
      rawBody = { message: String(formData.get("message") ?? "") };
    }
    imageFiles = formData.getAll("images").filter(isUploadFile);
  } else {
    try {
      rawBody = await request.json();
    } catch {
      return { ok: false, response: jsonErrorResponse("Invalid JSON body", 400) };
    }
  }

  const parsedBody = agentMessageSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return { ok: false, response: jsonErrorResponse("message is required", 400) };
  }
  if (!parsedBody.data.message && imageFiles.length === 0) {
    return { ok: false, response: jsonErrorResponse("message or image is required", 400) };
  }

  return { ok: true, body: parsedBody.data, imageFiles };
}
