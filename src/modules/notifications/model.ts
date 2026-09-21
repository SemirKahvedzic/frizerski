import { normalizeLocale } from "@/i18n/messages";
import type { AppLocale } from "@/i18n/routing";
import { prisma } from "@/lib/db";
import type { PlanModel, Recipient, RecipientPrefs } from "@/modules/notifications/plan";

/**
 * Everything the dispatcher needs about one booking, loaded fresh from the
 * database (docs/notifications.md §4). Returned recipients already carry
 * locale and preferences so planning stays pure.
 */
export type BookingNotificationModel = PlanModel & {
  booking: {
    id: string;
    status: string;
    version: number;
    startsAt: Date;
    endsAt: Date;
    durationMinutes: number;
    priceCents: number;
    currency: string;
    clientNotes: string | null;
    cancellationReason: string | null;
    source: string;
  };
  salon: {
    id: string;
    slug: string;
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    timezone: string;
    defaultLocale: AppLocale;
    cancellationCutoffHours: number;
  };
  service: { name: string };
  employeeName: string;
  customerRecord: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    userId: string | null;
  };
};

type PrefsRow = RecipientPrefs | null | undefined;

function prefs(row: PrefsRow): RecipientPrefs | null {
  if (!row) return null;
  const { emailEnabled, pushEnabled, reminder24h, reminder1h, marketingEmails } = row;
  return { emailEnabled, pushEnabled, reminder24h, reminder1h, marketingEmails };
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  locale: true,
  isActive: true,
  notificationPreference: true,
  pushSubscriptions: { where: { failedAt: null }, select: { id: true } },
} as const;

type UserRow = {
  id: string;
  email: string;
  name: string;
  locale: string | null;
  isActive: boolean;
  notificationPreference: RecipientPrefs | null;
  pushSubscriptions: { id: string }[];
};

function staffRecipient(user: UserRow, fallbackLocale: AppLocale): Recipient {
  return {
    key: `user:${user.id}`,
    kind: "staff",
    name: user.name,
    email: user.email,
    locale: normalizeLocale(user.locale ?? fallbackLocale),
    userId: user.id,
    prefs: prefs(user.notificationPreference),
    pushSubscriptions: user.pushSubscriptions.length,
  };
}

export async function loadBookingNotificationModel(
  bookingId: string,
  options: { previousEmployeeId?: string | null } = {},
): Promise<BookingNotificationModel | null> {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      version: true,
      startsAt: true,
      endsAt: true,
      durationMinutes: true,
      priceCents: true,
      currency: true,
      clientNotes: true,
      cancellationReason: true,
      source: true,
      salon: {
        select: {
          id: true,
          slug: true,
          name: true,
          address: true,
          city: true,
          phone: true,
          email: true,
          timezone: true,
          defaultLocale: true,
          settings: true,
        },
      },
      service: { select: { name: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userId: true,
          user: { select: userSelect },
        },
      },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          userId: true,
          user: { select: userSelect },
        },
      },
    },
  });
  if (!row) return null;

  const salonLocale = normalizeLocale(row.salon.defaultLocale);
  const settings = row.salon.settings;

  const admins = await prisma.salonMembership.findMany({
    where: { salonId: row.salon.id, role: { in: ["OWNER", "ADMIN"] }, user: { isActive: true } },
    select: { user: { select: userSelect } },
  });

  const employeeRecipient = (emp: typeof row.employee | null): Recipient | null => {
    if (!emp) return null;
    if (emp.user && emp.user.isActive) return staffRecipient(emp.user, salonLocale);
    if (!emp.email) return null;
    return {
      key: `employee:${emp.id}`,
      kind: "staff",
      name: `${emp.firstName} ${emp.lastName}`,
      email: emp.email,
      locale: salonLocale,
      userId: null,
      prefs: null,
      pushSubscriptions: 0,
    };
  };

  let previousEmployee: Recipient | null = null;
  if (options.previousEmployeeId && options.previousEmployeeId !== row.employee.id) {
    const prev = await prisma.employee.findUnique({
      where: { id: options.previousEmployeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userId: true,
        user: { select: userSelect },
      },
    });
    previousEmployee = employeeRecipient(prev);
  }

  const customer: Recipient = {
    key: row.customer.userId ? `user:${row.customer.userId}` : `customer:${row.customer.id}`,
    kind: "customer",
    name: `${row.customer.firstName} ${row.customer.lastName}`,
    email: row.customer.email,
    locale: normalizeLocale(row.customer.user?.locale ?? salonLocale),
    userId: row.customer.userId,
    prefs: prefs(row.customer.user?.notificationPreference),
    pushSubscriptions: row.customer.user?.pushSubscriptions.length ?? 0,
  };

  return {
    settings: {
      emailNotificationsEnabled: settings?.emailNotificationsEnabled ?? true,
      pushNotificationsEnabled: settings?.pushNotificationsEnabled ?? true,
      notifyAdminsOnNewBooking: settings?.notifyAdminsOnNewBooking ?? true,
      notifyEmployeeOnNewBooking: settings?.notifyEmployeeOnNewBooking ?? true,
      reminder24hEnabled: settings?.reminder24hEnabled ?? true,
      reminder1hEnabled: settings?.reminder1hEnabled ?? true,
    },
    customer,
    admins: admins.map((m) => staffRecipient(m.user, salonLocale)),
    employee: employeeRecipient(row.employee),
    previousEmployee,
    booking: {
      id: row.id,
      status: row.status,
      version: row.version,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      durationMinutes: row.durationMinutes,
      priceCents: row.priceCents,
      currency: row.currency,
      clientNotes: row.clientNotes,
      cancellationReason: row.cancellationReason,
      source: row.source,
    },
    salon: {
      id: row.salon.id,
      slug: row.salon.slug,
      name: row.salon.name,
      address: row.salon.address,
      city: row.salon.city,
      phone: row.salon.phone,
      email: row.salon.email,
      timezone: row.salon.timezone,
      defaultLocale: salonLocale,
      cancellationCutoffHours: settings?.cancellationCutoffHours ?? 12,
    },
    service: { name: row.service.name },
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    customerRecord: {
      id: row.customer.id,
      firstName: row.customer.firstName,
      lastName: row.customer.lastName,
      email: row.customer.email,
      phone: row.customer.phone,
      userId: row.customer.userId,
    },
  };
}
