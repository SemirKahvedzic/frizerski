"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import type { ImagePurpose, ImageView } from "@/modules/media/image-view";

/** Uploads one file to `POST /api/v1/salons/:salonId/images` and returns the stored image. */
export function useImageUpload(salonId: string) {
  const t = useTranslations("media.errors");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, purpose: ImagePurpose, altText?: string): Promise<ImageView | null> => {
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("purpose", purpose);
        if (altText) form.set("altText", altText);
        const response = await fetch(`/api/v1/salons/${salonId}/images`, {
          method: "POST",
          body: form,
        });
        const body = (await response.json()) as {
          data?: ImageView;
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !body.data) {
          const code = body.error?.code;
          setError(
            code === "PAYLOAD_TOO_LARGE"
              ? t("tooLarge")
              : code === "UNSUPPORTED_MEDIA_TYPE"
                ? t("unsupported")
                : (body.error?.message ?? t("generic")),
          );
          return null;
        }
        return body.data;
      } catch {
        setError(t("generic"));
        return null;
      } finally {
        setUploading(false);
      }
    },
    [salonId, t],
  );

  return { upload, uploading, error, clearError: () => setError(null) };
}
