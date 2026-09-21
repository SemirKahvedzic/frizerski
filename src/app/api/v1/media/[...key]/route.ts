import type { NextRequest } from "next/server";

import { getStorageProvider, isValidStorageKey } from "@/modules/media";

export const dynamic = "force-dynamic";

/**
 * Serves stored image variants for providers that keep the bytes locally
 * (`local`, `fake`); for S3-style providers it redirects to the public URL.
 * Keys are immutable (they contain the image id), hence the long cache.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: parts } = await context.params;
  const key = parts.join("/");
  if (!isValidStorageKey(key)) return new Response("Not found", { status: 404 });

  const storage = getStorageProvider();
  if (!storage.getObject) {
    return Response.redirect(storage.publicUrl(key), 302);
  }
  const object = await storage.getObject(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.body), {
    status: 200,
    headers: {
      "content-type": object.contentType,
      "content-length": String(object.body.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
