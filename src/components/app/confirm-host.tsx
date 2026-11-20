"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConfirmStore } from "@/lib/confirm";

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const t = useTranslations("app.confirm");
  const close = (ok: boolean) => { req?.resolve(ok); useConfirmStore.setState({ req: null }); };
  return (
    <AlertDialog open={!!req} onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription>{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant={req?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {req?.action ?? t("ok")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
