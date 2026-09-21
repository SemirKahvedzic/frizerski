export type CalendarView = "day" | "week" | "month";

export type CalendarBooking = {
  kind: "booking";
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  version: number;
  source: "ONLINE" | "ADMIN" | "WALK_IN";
  employeeId: string;
  employeeName: string;
  color: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  clientNotes: string | null;
  internalNotes: string | null;
};

export type CalendarBlock = {
  kind: "blocked" | "timeoff";
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  employeeId: string | null;
  label: string | null;
};

export type CalendarItem = CalendarBooking | CalendarBlock;

export type CalendarEmployee = { id: string; name: string; color: string | null };
export type CalendarService = {
  id: string;
  name: string;
  durationMinutes: number;
  employeeIds: string[];
};

export type CalendarData = {
  salonId: string;
  salonSlug: string;
  timezone: string;
  view: CalendarView;
  date: string;
  today: string;
  employeeFilter: string | null;
  dayStartMin: number;
  dayEndMin: number;
  employees: CalendarEmployee[];
  services: CalendarService[];
  items: CalendarItem[];
  canManage: boolean;
};
