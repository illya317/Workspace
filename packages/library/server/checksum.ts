import { stat, readFile } from "fs/promises";
import { createHash } from "crypto";

const CHECKSUM_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function computeChecksum(absolutePath: string): Promise<string | null> {
  try {
    const s = await stat(absolutePath);
    if (s.size > CHECKSUM_MAX_SIZE) return null;
    const buf = await readFile(absolutePath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}
