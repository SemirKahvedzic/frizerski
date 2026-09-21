/**
 * Object storage port (docs/architecture.md §9). Keys are always tenant
 * prefixed: `salons/{salonId}/{purpose}/{imageId}/{variant}.webp`.
 */
export interface StorageProvider {
  readonly name: string;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Removes every object under the prefix; returns how many were deleted. */
  deletePrefix(prefix: string): Promise<number>;
  /** Browser-facing URL (absolute or root-relative). */
  publicUrl(key: string): string;
  /** Implemented by providers that hold the bytes themselves (local, fake); the media route streams them. */
  getObject?(key: string): Promise<{ body: Buffer; contentType: string } | null>;
}

/** Only keys produced by the pipeline are ever read or written. */
export const STORAGE_KEY_PATTERN =
  /^salons\/[0-9a-f-]{36}\/(logo|cover|gallery|service|employee|avatar)\/[0-9a-f-]{36}\/(thumb|md|lg|orig)\.webp$/;

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key);
}
