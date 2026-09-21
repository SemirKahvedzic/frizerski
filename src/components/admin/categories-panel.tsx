"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormStatus } from "@/components/forms/form-status";
import { errorsFor, useServerAction } from "@/components/forms/use-server-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/api/define-action";

type CategoryValue = { id: string; name: string; serviceCount: number };

type Props = {
  salonSlug: string;
  categories: CategoryValue[];
  createAction: (input: unknown) => Promise<ActionResult<{ id: string }>>;
  renameAction: (input: unknown) => Promise<ActionResult<{ id: string }>>;
  deleteAction: (input: {
    salonSlug: string;
    categoryId: string;
  }) => Promise<ActionResult<{ id: string }>>;
};

export function CategoriesPanel({
  salonSlug,
  categories,
  createAction,
  renameAction,
  deleteAction,
}: Props) {
  const t = useTranslations("services.categories");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const create = useServerAction(createAction, { onSuccess: () => router.refresh() });
  const rename = useServerAction(renameAction, {
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const remove = useServerAction(deleteAction, { onSuccess: () => router.refresh() });

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await create.run({ salonSlug, name: new FormData(form).get("name") });
    if (result.ok) form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormStatus
          error={create.formError ?? rename.formError ?? remove.formError}
          success={false}
        />
        {categories.length > 0 ? (
          <ul className="divide-y rounded-lg border text-sm">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
                data-testid={`category-row-${c.id}`}
              >
                {editing === c.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename.run({ salonSlug, categoryId: c.id, name: draft });
                    }}
                  >
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label={t("name")}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      aria-label={t("save")}
                      disabled={rename.pending}
                    >
                      <Check aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("cancel")}
                      onClick={() => setEditing(null)}
                    >
                      <X aria-hidden />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1">
                      {c.name} <span className="text-muted-foreground">({c.serviceCount})</span>
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${t("rename")} ${c.name}`}
                      onClick={() => {
                        setEditing(c.id);
                        setDraft(c.name);
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`${t("delete")} ${c.name}`}
                      onClick={() => remove.run({ salonSlug, categoryId: c.id })}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <form
          onSubmit={onCreate}
          noValidate
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <Field className="flex-1">
            <FieldLabel htmlFor="categoryName">{t("name")}</FieldLabel>
            <Input
              id="categoryName"
              name="name"
              placeholder={t("placeholder")}
              aria-invalid={Boolean(create.fieldErrors["name"])}
            />
            <FieldError errors={errorsFor(create.fieldErrors, "name")} />
          </Field>
          <Button type="submit" variant="outline" disabled={create.pending}>
            {t("add")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
