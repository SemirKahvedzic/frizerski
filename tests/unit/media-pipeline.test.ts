import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { UnsupportedMediaTypeError } from "@/lib/errors";
import { imageKeyPrefix, processImage, variantKey } from "@/modules/media/pipeline";
import { isValidStorageKey } from "@/modules/media/storage/types";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 60 } } })
    .png()
    .toBuffer();
}

describe("image pipeline", () => {
  it("produces capped WebP variants and a placeholder", async () => {
    const result = await processImage(await png(2000, 1000));
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBe(2000);
    expect(result.variants.thumb.width).toBe(320);
    expect(result.variants.thumb.height).toBe(160);
    expect(result.variants.md.width).toBe(800);
    expect(result.variants.lg.width).toBe(1600);
    expect(result.variants.orig.width).toBe(2000); // under the 2400 cap → not enlarged
    expect(result.placeholder.startsWith("data:image/webp;base64,")).toBe(true);
    const meta = await sharp(result.variants.md.buffer).metadata();
    expect(meta.format).toBe("webp");
  });

  it("never enlarges small images", async () => {
    const result = await processImage(await png(200, 200));
    expect(result.variants.lg.width).toBe(200);
    expect(result.variants.thumb.width).toBe(200);
  });

  it("rejects non-image and SVG payloads", async () => {
    await expect(processImage(Buffer.from("hello world"))).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError,
    );
    await expect(
      processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it("builds tenant-prefixed keys that pass the storage guard", () => {
    const prefix = imageKeyPrefix(
      "0192b7e0-0000-7000-8000-000000000001",
      "GALLERY",
      "0192b7e0-0000-7000-8000-000000000002",
    );
    expect(prefix).toBe(
      "salons/0192b7e0-0000-7000-8000-000000000001/gallery/0192b7e0-0000-7000-8000-000000000002/",
    );
    expect(isValidStorageKey(variantKey(prefix, "md"))).toBe(true);
    expect(isValidStorageKey("../etc/passwd")).toBe(false);
    expect(isValidStorageKey(`${prefix}md.svg`)).toBe(false);
  });
});
