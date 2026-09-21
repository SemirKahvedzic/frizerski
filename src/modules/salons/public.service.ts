import { prisma } from "@/lib/db";
import { dateStringToUtc, utcToDateString } from "@/lib/time";
import { getPublicGallery, type PublicGalleryItem } from "@/modules/media/gallery.service";
import type { ImageView } from "@/modules/media/image-view";
import { loadImageViews } from "@/modules/media/media.service";
import { defaultWorkingHours } from "@/modules/salons/defaults";
import type { Closure, WorkingDay } from "@/modules/salons/salon.service";

/**
 * Public, unauthenticated view of an ACTIVE salon for `/salon/[slug]`.
 * Uses the raw client on purpose: there is no actor, and only public fields
 * are selected.
 */
export type PublicEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  bio: string | null;
  audience: "MALE" | "FEMALE" | "UNISEX";
  color: string | null;
  avatar: ImageView | null;
};

export type PublicService = {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  audience: "MALE" | "FEMALE" | "UNISEX";
  employeeIds: string[];
  image: ImageView | null;
};

export type PublicCategory = { id: string; name: string; sortOrder: number };

export type PublicSalon = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  audience: "MALE" | "FEMALE" | "UNISEX";
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  googleMapsUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  brandColor: string | null;
  logo: ImageView | null;
  cover: ImageView | null;
  gallery: PublicGalleryItem[];
  timezone: string;
  currency: string;
  defaultLocale: string;
  workingHours: WorkingDay[];
  /** Closures ending on or after `fromDate`. */
  closures: Closure[];
  employees: PublicEmployee[];
  categories: PublicCategory[];
  services: PublicService[];
  booking: {
    allowGuestBooking: boolean;
    cancellationCutoffHours: number;
    maxBookingAdvanceDays: number;
  };
};

export async function getPublicSalon(slug: string, fromDate: string): Promise<PublicSalon | null> {
  const salon = await prisma.salon.findUnique({
    where: { slug, status: "ACTIVE" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      audience: true,
      address: true,
      city: true,
      postalCode: true,
      country: true,
      googleMapsUrl: true,
      phone: true,
      email: true,
      website: true,
      instagram: true,
      facebook: true,
      tiktok: true,
      brandColor: true,
      logoImageId: true,
      coverImageId: true,
      timezone: true,
      currency: true,
      defaultLocale: true,
      settings: {
        select: {
          allowGuestBooking: true,
          cancellationCutoffHours: true,
          maxBookingAdvanceDays: true,
        },
      },
      workingHours: {
        orderBy: { weekday: "asc" },
        select: { weekday: true, isClosed: true, opensAt: true, closesAt: true },
      },
      closures: {
        where: { endsOn: { gte: dateStringToUtc(fromDate) } },
        orderBy: { startsOn: "asc" },
        take: 20,
        select: { id: true, startsOn: true, endsOn: true, reason: true },
      },
      categories: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, sortOrder: true },
      },
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          categoryId: true,
          name: true,
          description: true,
          priceCents: true,
          currency: true,
          durationMinutes: true,
          audience: true,
          imageId: true,
          employees: { select: { employeeId: true } },
        },
      },
      employees: {
        where: { isActive: true, isBookableOnline: true },
        orderBy: [{ sortOrder: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          position: true,
          bio: true,
          audience: true,
          color: true,
          avatarImageId: true,
        },
      },
    },
  });
  if (!salon) return null;

  const [images, gallery] = await Promise.all([
    loadImageViews(salon.id, [
      salon.logoImageId,
      salon.coverImageId,
      ...salon.employees.map((e) => e.avatarImageId),
      ...salon.services.map((s) => s.imageId),
    ]),
    getPublicGallery(slug),
  ]);
  const imageOrNull = (id: string | null) => (id ? (images.get(id) ?? null) : null);

  const { settings, workingHours, closures, employees, categories, services, ...rest } = salon;
  const byDay = new Map(workingHours.map((r) => [r.weekday, r]));

  return {
    ...rest,
    workingHours: defaultWorkingHours().map((d) => byDay.get(d.weekday) ?? d),
    closures: closures.map((c) => ({
      id: c.id,
      startsOn: utcToDateString(c.startsOn),
      endsOn: utcToDateString(c.endsOn),
      reason: c.reason,
    })),
    logo: imageOrNull(salon.logoImageId),
    cover: imageOrNull(salon.coverImageId),
    gallery,
    employees: employees.map(({ avatarImageId, ...e }) => ({
      ...e,
      avatar: imageOrNull(avatarImageId),
    })),
    categories,
    services: services.map(({ employees: providers, ...service }) => ({
      ...service,
      employeeIds: providers.map((p) => p.employeeId),
      image: imageOrNull(service.imageId),
    })),
    booking: {
      allowGuestBooking: settings?.allowGuestBooking ?? true,
      cancellationCutoffHours: settings?.cancellationCutoffHours ?? 12,
      maxBookingAdvanceDays: settings?.maxBookingAdvanceDays ?? 60,
    },
  };
}
