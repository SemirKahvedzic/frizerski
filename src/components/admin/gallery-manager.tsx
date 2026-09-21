"use client";

import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { SalonImage } from "@/components/media/salon-image";
import { useImageUpload } from "@/components/media/use-image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ImageView } from "@/modules/media/image-view";

export type GalleryItem = { id: string; imageId: string; caption: string | null; image: ImageView };

const MAX_FILES = 20;

export function GalleryManager({ salonId, items }: { salonId: string; items: GalleryItem[] }) {
  const t = useTranslations("gallery");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, error } = useImageUpload(salonId);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function api(path: string, init: RequestInit): Promise<boolean> {
    const response = await fetch(`/api/v1/salons/${salonId}/gallery${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(body.error?.message ?? t("error"));
      return false;
    }
    return true;
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, MAX_FILES);
    setMessage(null);
    setProgress({ done: 0, total: list.length });
    for (const [index, file] of list.entries()) {
      const image = await upload(file, "GALLERY");
      if (image) await api("", { method: "POST", body: JSON.stringify({ imageId: image.id }) });
      setProgress({ done: index + 1, total: list.length });
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusy(items[index]!.id);
    if (await api("/reorder", { method: "PUT", body: JSON.stringify({ ids }) })) router.refresh();
    setBusy(null);
  }

  async function saveCaption(item: GalleryItem, caption: string) {
    if ((item.caption ?? "") === caption.trim()) return;
    setBusy(item.id);
    await api(`/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ caption: caption.trim() || null }),
    });
    setBusy(null);
    router.refresh();
  }

  async function remove(item: GalleryItem) {
    if (!window.confirm(t("removeConfirm"))) return;
    setBusy(item.id);
    if (await api(`/${item.id}?deleteImage=true`, { method: "DELETE" })) router.refresh();
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => void onFiles(e.target.files)}
            data-testid="gallery-file-input"
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            data-testid="gallery-upload"
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ImagePlus aria-hidden />
            )}
            {t("upload")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {progress
              ? t("uploading", { done: progress.done, total: progress.total })
              : t("uploadHint")}
          </span>
        </CardContent>
      </Card>

      {error || message ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? message}</AlertDescription>
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery-grid">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border bg-card"
              data-testid={`gallery-item-${item.id}`}
            >
              <div className="aspect-[4/3] bg-muted">
                <SalonImage
                  image={item.image}
                  variant="md"
                  className="size-full object-cover"
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <div className="space-y-2 p-3">
                <Input
                  defaultValue={item.caption ?? ""}
                  placeholder={t("captionPlaceholder")}
                  aria-label={t("caption")}
                  onBlur={(e) => void saveCaption(item, e.target.value)}
                  disabled={busy === item.id}
                />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={t("moveUp")}
                      disabled={index === 0 || busy !== null}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={t("moveDown")}
                      disabled={index === items.length - 1 || busy !== null}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy !== null}
                    onClick={() => remove(item)}
                    data-testid={`gallery-remove-${item.id}`}
                  >
                    <Trash2 aria-hidden /> {t("remove")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
