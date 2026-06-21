import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_URL_PREFIX = "/assets/user/avatar";
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export type AvatarLibraryItem = {
  fileName: string;
  url: string;
};

export type UploadAvatarResult =
  | { success: true; item: AvatarLibraryItem }
  | { success: false; status: number; error: string };

function getWorkspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (configured) return configured;
  return path.resolve(process.cwd(), "..", ".workspace");
}

function getAvatarDir() {
  return path.join(getWorkspaceConfigDir(), "assets", "user", "avatar");
}

function safeBaseName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "avatar";
}

function avatarUrl(fileName: string) {
  return `${AVATAR_URL_PREFIX}/${encodeURIComponent(fileName)}`;
}

export async function listAccountAvatars(): Promise<AvatarLibraryItem[]> {
  const dir = getAvatarDir();
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ fileName: entry.name, url: avatarUrl(entry.name) }));
}

export async function uploadAccountAvatar(file: File, userId: number): Promise<UploadAvatarResult> {
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) {
    return { success: false, status: 400, error: "仅支持 PNG、JPG、WEBP 或 GIF 图片" };
  }
  if (file.size <= 0) {
    return { success: false, status: 400, error: "头像文件为空" };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { success: false, status: 400, error: "头像文件不能超过 2MB" };
  }

  const dir = getAvatarDir();
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const baseName = safeBaseName(file.name);
  const fileName = `user-${userId}-${Date.now()}-${baseName}.${extension}`;
  await writeFile(path.join(dir, fileName), buffer);

  return {
    success: true,
    item: {
      fileName,
      url: avatarUrl(fileName),
    },
  };
}
