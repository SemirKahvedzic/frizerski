import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DeleteEmployeeButton } from "@/components/admin/delete-employee-button";
import { EmployeeForm } from "@/components/admin/employee-form";
import { InvitePanel } from "@/components/admin/invite-panel";
import { PageHeader } from "@/components/admin/page-header";
import { ScheduleEditor } from "@/components/admin/schedule-editor";
import { TimeOffPanel } from "@/components/admin/time-off-panel";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { resolveLocaleParam } from "@/i18n/params";
import { prisma } from "@/lib/db";
import { isAppError } from "@/lib/errors";
import { getEmployee, getSchedule, listTimeOff } from "@/modules/employees";
import { getSalon, getWorkingHours } from "@/modules/salons";

import { getAdminContext } from "../../_context";
import {
  addTimeOffAction,
  deleteEmployeeAction,
  inviteEmployeeAction,
  removeTimeOffAction,
  setScheduleAction,
  updateEmployeeAction,
} from "../actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees/[employeeId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "adminNav" });
  return { title: t("employees") };
}

export default async function EmployeeDetailPage({
  params,
}: PageProps<"/[locale]/admin/[salonSlug]/employees/[employeeId]">) {
  const locale = await resolveLocaleParam(params);
  const { salonSlug, employeeId } = await params;
  const ctx = await getAdminContext(locale, salonSlug);

  let employee;
  try {
    employee = await getEmployee(ctx, employeeId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const [salon, hours, schedule, timeOff, linkedUser, t] = await Promise.all([
    getSalon(ctx),
    getWorkingHours(ctx),
    getSchedule(ctx, employeeId),
    listTimeOff(ctx, { employeeId, from: new Date() }),
    employee.userId
      ? prisma.user.findUnique({ where: { id: employee.userId }, select: { email: true } })
      : null,
    getTranslations("employees"),
  ]);

  return (
    <>
      <PageHeader
        title={`${employee.firstName} ${employee.lastName}`}
        description={employee.position ?? t("detailSubtitle")}
        actions={
          <>
            <Button variant="outline" render={<Link href={`/admin/${salonSlug}/employees`} />}>
              {t("backToList")}
            </Button>
            <DeleteEmployeeButton
              salonSlug={salonSlug}
              employeeId={employeeId}
              action={deleteEmployeeAction}
            />
          </>
        }
      />
      <div className="space-y-8">
        <EmployeeForm
          salonSlug={salonSlug}
          employeeId={employeeId}
          initial={employee}
          action={updateEmployeeAction}
        />
        <ScheduleEditor
          salonSlug={salonSlug}
          employeeId={employeeId}
          initial={schedule}
          salonHours={hours}
          action={setScheduleAction}
        />
        <TimeOffPanel
          salonSlug={salonSlug}
          employeeId={employeeId}
          timezone={salon.timezone}
          items={timeOff.map((item) => ({
            ...item,
            startsAt: item.startsAt.toISOString(),
            endsAt: item.endsAt.toISOString(),
          }))}
          addAction={addTimeOffAction}
          removeAction={removeTimeOffAction}
        />
        <InvitePanel
          salonSlug={salonSlug}
          employeeId={employeeId}
          linkedEmail={linkedUser?.email ?? null}
          defaultEmail={employee.email}
          action={inviteEmployeeAction}
        />
      </div>
    </>
  );
}
