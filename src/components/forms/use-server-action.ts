"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import type { ActionResult } from "@/lib/api/define-action";

/**
 * Runs a Server Action created with `defineAuthedAction` and exposes pending
 * state, translated per-field errors (validation messages are i18n keys) and
 * a translated form-level error.
 */
export function useServerAction<I, O>(
  action: (input: I) => Promise<ActionResult<O>>,
  options: { onSuccess?: (data: O) => void | Promise<void> } = {},
) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const translate = useCallback(
    (message: string) =>
      /^[a-z]+\.[a-zA-Z.]+$/.test(message) && t.has(message as never)
        ? t(message as never)
        : message,
    [t],
  );

  const run = useCallback(
    async (input: I): Promise<ActionResult<O>> => {
      setPending(true);
      setFormError(null);
      setFieldErrors({});
      setSuccess(false);
      const result = await action(input);
      setPending(false);

      if (result.ok) {
        setSuccess(true);
        await options.onSuccess?.(result.data);
        return result;
      }

      if (result.error.fieldErrors) {
        const translated: Record<string, string> = {};
        for (const [key, message] of Object.entries(result.error.fieldErrors)) {
          translated[key] = translate(message);
        }
        setFieldErrors(translated);
      }
      if (result.error.code !== "VALIDATION_ERROR") {
        const key = `errors.codes.${result.error.code}`;
        setFormError(t.has(key as never) ? t(key as never) : result.error.message);
      }
      return result;
    },
    [action, options, t, translate],
  );

  const reset = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
    setSuccess(false);
  }, []);

  return { run, pending, fieldErrors, formError, success, reset };
}

export function errorsFor(fieldErrors: Record<string, string>, key: string) {
  const message = fieldErrors[key];
  return message ? [{ message }] : undefined;
}
