import { mkdir, readFile, rm, unlink } from "node:fs/promises";
import path from "node:path";

import { isValidStorageKey, type StorageProvider } from "@/modules/media/storage/types";

/**
 * Filesystem storage for development and single-node deployments. Objects
 * live under `STORAGE_LOCAL_DIR` and are served by `/api/v1/media/{key}`.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  constructor(private readonly rootDir: string) {}

  private resolve(key: string): string {
    if (!isValidStorageKey(key) && !/^salons\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}\/?$/.test(key)) {
      throw new Error(`Refusing to touch storage key outside the media layout: ${key}`);
    }
    const full = path.resolve(this.rootDir, key);
    if (!full.startsWith(path.resolve(this.rootDir))) throw new Error("Path traversal blocked");
    return full;
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(full, body);
  }

  async deleteObject(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }

  async deletePrefix(prefix: string): Promise<number> {
    const dir = this.resolve(prefix.endsWith("/") ? prefix : `${prefix}/`);
    await rm(dir, { recursive: true, force: true });
    return 1;
  }

  publicUrl(key: string): string {
    return `/api/v1/media/${key}`;
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    try {
      const body = await readFile(this.resolve(key));
      return { body, contentType: "image/webp" };
    } catch {
      return null;
    }
  }
}
