import assert from "node:assert/strict";
import test from "node:test";

import { detectWecomImageMimeType, readWecomAgentInput } from "./wecom-agent-input.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);

test("detects outbound library images before rich-message delivery", () => {
  assert.equal(detectWecomImageMimeType(png), "image/png");
  assert.equal(detectWecomImageMimeType(jpeg), "image/jpeg");
  assert.throws(() => detectWecomImageMimeType(Buffer.from("not-an-image")), /仅支持/);
});

test("reads a WeCom image into the signed bridge image shape", async () => {
  const client = {
    async downloadFile(url, aeskey) {
      assert.equal(url, "https://wecom.test/image");
      assert.equal(aeskey, "secret-aes-key");
      return { buffer: png, filename: "截图.png" };
    },
  };
  const result = await readWecomAgentInput(client, {
    body: {
      msgtype: "image",
      image: { url: "https://wecom.test/image", aeskey: "secret-aes-key" },
    },
  });

  assert.equal(result.message, "");
  assert.deepEqual(result.images, [{
    fileName: "截图.png",
    mimeType: "image/png",
    base64: png.toString("base64"),
  }]);
});

test("preserves mixed text order and downloads every mixed image", async () => {
  const client = {
    async downloadFile(url) {
      assert.equal(url, "https://wecom.test/photo");
      return { buffer: jpeg, filename: "photo.jpg" };
    },
  };
  const result = await readWecomAgentInput(client, {
    body: {
      msgtype: "mixed",
      mixed: {
        msg_item: [
          { msgtype: "text", text: { content: "先看这张图" } },
          { msgtype: "image", image: { url: "https://wecom.test/photo" } },
          { msgtype: "text", text: { content: "分析异常" } },
        ],
      },
    },
  });

  assert.equal(result.message, "先看这张图\n[图片1]\n分析异常");
  assert.equal(result.images[0].mimeType, "image/jpeg");
});
