import type { StorageProvider } from "@/modules/media/storage/types";

/** In-memory storage for tests. */
export class FakeStorageProvider implements StorageProvider {
  readonly name = "fake";
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<number> {
    let n = 0;
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) {
        this.objects.delete(key);
        n += 1;
      }
    }
    return n;
  }

  publicUrl(key: string): string {
    return `/api/v1/media/${key}`;
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    return this.objects.get(key) ?? null;
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  reset(): void {
    this.objects.clear();
  }
}
