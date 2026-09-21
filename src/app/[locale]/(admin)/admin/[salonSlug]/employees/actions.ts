"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cacheTags } from "@/lib/cache/tags";
import { env } from "@/lib/env";
import { defineAuthedAction } from "@/modules/auth/action";
import {
  addTimeOff,
  createEmployee,
  deleteEmployee,
  employeeInputSchema,
  inviteEmployeeSchema,
  inviteEmployeeUser,
  removeTimeOff,
  scheduleInputSchema,
  setSchedule,
  timeOffInputSchema,
  updateEmployee,
} from "@/modules/employees";
import { resolveTenantContext } from "@/modules/tenant";

const withSlug = { salonSlug: z.string().min(1) };

export const createEmployeeAction = defineAuthedAction({
  name: "employees.create",
  schema: employeeInputSchema.extend(withSlug),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...data } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const employee = await createEmployee(ctx, data);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: employee.id };
  },
});

export const updateEmployeeAction = defineAuthedAction({
  name: "employees.update",
  schema: employeeInputSchema.extend({ ...withSlug, employeeId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, employeeId, ...data } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const employee = await updateEmployee(ctx, employeeId, data);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: employee.id };
  },
});

export const deleteEmployeeAction = defineAuthedAction({
  name: "employees.delete",
  schema: z.object({ ...withSlug, employeeId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    await deleteEmployee(ctx, input.employeeId);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.employeeId };
  },
});

export const setScheduleAction = defineAuthedAction({
  name: "employees.schedule.set",
  schema: z.object({ ...withSlug, employeeId: z.uuid(), blocks: scheduleInputSchema }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    const blocks = await setSchedule(ctx, input.employeeId, input.blocks);
    return { count: blocks.length };
  },
});

export const addTimeOffAction = defineAuthedAction({
  name: "employees.timeOff.add",
  schema: timeOffInputSchema.safeExtend({ ...withSlug, employeeId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, employeeId, ...data } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const row = await addTimeOff(ctx, employeeId, data);
    return { id: row.id };
  },
});

export const removeTimeOffAction = defineAuthedAction({
  name: "employees.timeOff.remove",
  schema: z.object({ ...withSlug, timeOffId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    await removeTimeOff(ctx, input.timeOffId);
    return { id: input.timeOffId };
  },
});

export const inviteEmployeeAction = defineAuthedAction({
  name: "employees.invite",
  schema: inviteEmployeeSchema.extend({
    ...withSlug,
    employeeId: z.uuid(),
    locale: z.string().min(2).max(5),
  }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    return inviteEmployeeUser(ctx, input.employeeId, input.email, {
      registerUrl: `${env.APP_URL}/${input.locale}/register`,
    });
  },
});
