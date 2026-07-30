import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { storeAgentSessionImagesAt } from "./session-images";

type UploadFile = Parameters<typeof storeAgentSessionImagesAt>[2][number];

test("session image storage preserves the original and returns a bounded model derivative", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-image-"));
  try {
    const original = await sharp({
      create: {
        width: 3_000,
        height: 1_200,
        channels: 3,
        background: { r: 240, g: 245, b: 255 },
      },
    }).png().toBuffer();
    const file = new NodeFile([original], "管理截图.png", { type: "image/png" });

    const [image] = await storeAgentSessionImagesAt(root, "sessions/test", [file as unknown as UploadFile]);

    assert.equal(image.size, original.length);
    assert.equal(image.mimeType, "image/png");
    assert.ok(image.model);
    assert.ok(image.model.size <= 512 * 1024);
    assert.ok(Math.max(image.model.width, image.model.height) <= 2_000);
    assert.match(image.dataUrl, /^data:image\/png;base64,/);
    assert.deepEqual(await readFile(path.join(root, image.storageKey!)), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session image validation rejects spoofed content before writing assets", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workspace-agent-image-"));
  try {
    const spoofed = new NodeFile([Buffer.from("not png")], "fake.png", { type: "image/png" });
    await assert.rejects(
      storeAgentSessionImagesAt(root, "sessions/test", [spoofed as unknown as UploadFile]),
      /内容与文件类型不匹配/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
