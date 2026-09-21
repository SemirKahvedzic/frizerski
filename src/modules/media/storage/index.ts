import { env } from "@/lib/env";
import { LocalStorageProvider } from "@/modules/media/storage/local";
import { FakeStorageProvider } from "@/modules/media/storage/memory";
import { S3StorageProvider } from "@/modules/media/storage/s3";
import type { StorageProvider } from "@/modules/media/storage/types";

const globalForStorage = globalThis as unknown as { __storageProvider?: StorageProvider };

function createFromEnv(): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "s3":
      return new S3StorageProvider({
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        publicBaseUrl: env.S3_PUBLIC_BASE_URL ?? "",
      });
    case "local":
      return new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
    case "fake":
      return new FakeStorageProvider();
  }
}

export function getStorageProvider(): StorageProvider {
  if (!globalForStorage.__storageProvider) globalForStorage.__storageProvider = createFromEnv();
  return globalForStorage.__storageProvider;
}

export function setStorageProvider(provider: StorageProvider | undefined): void {
  globalForStorage.__storageProvider = provider;
}

export { FakeStorageProvider, LocalStorageProvider, S3StorageProvider };
export { isValidStorageKey, type StorageProvider } from "@/modules/media/storage/types";
