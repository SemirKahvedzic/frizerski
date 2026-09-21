/* eslint-disable @next/next/no-img-element -- variants are pre-rendered WebP served from storage */
import type { ImageView } from "@/modules/media/image-view";

type Variant = keyof ImageView["variants"];

/**
 * Renders a stored image with a responsive `srcset` built from its variants.
 * Uses a plain `<img>`: the pipeline already produced optimised WebP, so the
 * Next image optimiser would only add cost.
 */
export function SalonImage({
  image,
  variant = "md",
  sizes,
  className,
  alt,
  loading = "lazy",
}: {
  image: ImageView;
  variant?: Variant;
  sizes?: string;
  className?: string;
  alt?: string;
  loading?: "lazy" | "eager";
}) {
  const v = image.variants[variant];
  const srcSet = (["thumb", "md", "lg"] as const)
    .map((name) => `${image.variants[name].url} ${image.variants[name].width}w`)
    .join(", ");
  return (
    <img
      src={v.url}
      srcSet={srcSet}
      sizes={sizes ?? `${v.width}px`}
      width={v.width}
      height={v.height}
      alt={alt ?? image.altText ?? ""}
      loading={loading}
      decoding="async"
      className={className}
      style={
        image.placeholder
          ? { backgroundImage: `url(${image.placeholder})`, backgroundSize: "cover" }
          : undefined
      }
    />
  );
}
