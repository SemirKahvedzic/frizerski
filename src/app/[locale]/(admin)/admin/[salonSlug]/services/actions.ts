"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cacheTags } from "@/lib/cache/tags";
import { defineAuthedAction } from "@/modules/auth/action";
import {
  categoryInputSchema,
  createCategory,
  createService,
  deleteCategory,
  deleteService,
  renameCategory,
  reorderServices,
  serviceInputSchema,
  setServiceActive,
  updateService,
} from "@/modules/services";
import { resolveTenantContext } from "@/modules/tenant";

const withSlug = { salonSlug: z.string().min(1) };

async function ctxFor(
  principal: Parameters<Parameters<typeof defineAuthedAction>[0]["handler"]>[0]["principal"],
  slug: string,
  requestId: string,
) {
  return resolveTenantContext(principal, { slug }, { requestId });
}

export const createCategoryAction = defineAuthedAction({
  name: "services.categories.create",
  schema: categoryInputSchema.extend(withSlug),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    const category = await createCategory(ctx, { name: input.name });
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: category.id };
  },
});

export const renameCategoryAction = defineAuthedAction({
  name: "services.categories.rename",
  schema: categoryInputSchema.extend({ ...withSlug, categoryId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    await renameCategory(ctx, input.categoryId, { name: input.name });
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.categoryId };
  },
});

export const deleteCategoryAction = defineAuthedAction({
  name: "services.categories.delete",
  schema: z.object({ ...withSlug, categoryId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    await deleteCategory(ctx, input.categoryId);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.categoryId };
  },
});

export const createServiceAction = defineAuthedAction({
  name: "services.create",
  schema: serviceInputSchema.extend(withSlug),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...data } = input;
    const ctx = await ctxFor(principal, salonSlug, requestId);
    const service = await createService(ctx, data);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: service.id };
  },
});

export const updateServiceAction = defineAuthedAction({
  name: "services.update",
  schema: serviceInputSchema.extend({ ...withSlug, serviceId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, serviceId, ...data } = input;
    const ctx = await ctxFor(principal, salonSlug, requestId);
    const service = await updateService(ctx, serviceId, data);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: service.id };
  },
});

export const setServiceActiveAction = defineAuthedAction({
  name: "services.setActive",
  schema: z.object({ ...withSlug, serviceId: z.uuid(), isActive: z.boolean() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    await setServiceActive(ctx, input.serviceId, input.isActive);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.serviceId };
  },
});

export const deleteServiceAction = defineAuthedAction({
  name: "services.delete",
  schema: z.object({ ...withSlug, serviceId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    await deleteService(ctx, input.serviceId);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.serviceId };
  },
});

export const reorderServicesAction = defineAuthedAction({
  name: "services.reorder",
  schema: z.object({ ...withSlug, ids: z.array(z.uuid()).min(1) }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await ctxFor(principal, input.salonSlug, requestId);
    await reorderServices(ctx, input.ids);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { count: input.ids.length };
  },
});
