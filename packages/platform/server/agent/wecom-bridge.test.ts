import assert from "node:assert/strict";
import test from "node:test";

import { toParsedAgentRequest } from "./wecom-bridge";

test("WeCom bridge turns signed image payloads into the shared File input", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const parsed = toParsedAgentRequest({
    msgId: "msg-1",
    userId: "user-1",
    chatType: "single",
    chatId: null,
    message: "看图",
    images: [{
      fileName: "截图.png",
      mimeType: "image/png",
      base64: png.toString("base64"),
    }],
    sessionId: null,
  });

  assert.equal(parsed.body.message, "看图");
  assert.equal(parsed.imageFiles.length, 1);
  assert.equal(parsed.imageFiles[0].name, "截图.png");
  assert.equal(parsed.imageFiles[0].type, "image/png");
  assert.deepEqual(Buffer.from(await parsed.imageFiles[0].arrayBuffer()), png);
});
