/**
 * Cache tag names shared by cached readers and the mutations that invalidate
 * them. Keep every tag here so a rename cannot silently break invalidation.
 */
export const cacheTags = {
  publicSalon: (slug: string) => `salon:${slug}`,
} as const;
