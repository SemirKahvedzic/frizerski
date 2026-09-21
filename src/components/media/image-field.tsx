"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { SalonImage } from "@/components/media/salon-image";
import { useImageUpload } from "@/components/media/use-image-upload";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { ImagePurpose, ImageView } from "@/modules/media/image-view";

/**
 * Single-image picker for forms (logo, cover, avatar, service image). Keeps
 * the chosen image id in a hidden input so FormData-based forms submit it.
 */
export function ImageField({
  salonId,
  purpose,
  name,
  label,
  hint,
  initial,
  shape = "square",
}: {
  salonId: string;
  purpose: ImagePurpose;
  name: string;
  label: string;
  hint?: string;
  initial: ImageView | null;
  shape?: "square" | "wide" | "circle";
}) {
  const t = useTranslations("media");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<ImageView | null>(initial);
  const { upload, uploading, error } = useImageUpload(salonId);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const uploaded = await upload(file, purpose);
    if (uploaded) setImage(uploaded);
    if (inputRef.current) inputRef.current.value = "";
  }

  const frame = cn(
    "relative flex items-center justify-center overflow-hidden border bg-muted/40 text-muted-foreground",
    shape === "wide" && "aspect-[3/1] w-full rounded-xl",
    shape === "square" && "size-28 rounded-xl",
    shape === "circle" && "size-28 rounded-full",
  );

  return (
    <div className="space-y-2" data-testid={`image-field-${name}`}>
      <div className="text-sm font-medium">{label}</div>
      <input type="hidden" name={name} value={image?.id ?? ""} />
      <div className="flex flex-wrap items-start gap-4">
        <div className={frame}>
          {image ? (
            <SalonImage
              image={image}
              variant={shape === "wide" ? "lg" : "thumb"}
              className="size-full object-cover"
            />
          ) : (
            <ImagePlus className="size-6" aria-hidden />
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
            data-testid={`image-input-${name}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus aria-hidden /> {image ? t("replace") : t("upload")}
          </Button>
          {image ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)}>
              <Trash2 aria-hidden /> {t("remove")}
            </Button>
          ) : null}
        </div>
      </div>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </div>
  );
}
