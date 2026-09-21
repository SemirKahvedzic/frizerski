"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileNav({ salonSlug, salonName }: { salonSlug: string; salonName: string }) {
  const t = useTranslations("adminNav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="outline" size="icon" className="lg:hidden" aria-label={t("open")} />
        }
      >
        <Menu aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0 pb-4 text-left">
          <SheetTitle>{salonName}</SheetTitle>
        </SheetHeader>
        <AdminNav salonSlug={salonSlug} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
