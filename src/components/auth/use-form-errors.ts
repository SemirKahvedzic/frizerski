"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { ZodType } from "zod";

/**
 * Tiny form helper: validates with a Zod schema whose messages are
 * translation keys, exposes per-field errors and a translated form-level
 * error mapped from Better Auth error codes.
 */
export function useFormErrors<T>(schema: ZodType<T>) {
  const t = useTranslations();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const validate = useCallback(
    (values: unknown): T | null => {
      const result = schema.safeParse(values);
      if (result.success) {
        setFieldErrors({});
        return result.data;
      }
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) {
          // Zod default messages are not keys; only translate our own keys.
          next[key] = issue.message.startsWith("auth.") ? t(issue.message as never) : issue.message;
        }
      }
      setFieldErrors(next);
      return null;
    },
    [schema, t],
  );

  const setAuthError = useCallback(
    (code: string | undefined | null) => {
      const key = `auth.errors.${code ?? "generic"}`;
      setFormError(t.has(key as never) ? t(key as never) : t("auth.errors.generic"));
    },
    [t],
  );

  const clear = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
  }, []);

  return { fieldErrors, formError, validate, setAuthError, setFormError, clear };
}

export function errorList(message: string | undefined) {
  return message ? [{ message }] : undefined;
}
