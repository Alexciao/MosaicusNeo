"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConfirmStore } from "@/lib/confirm";

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const close = (ok: boolean) => { req?.resolve(ok); useConfirmStore.setState({ req: null }); };
  return (
    <AlertDialog open={!!req} onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription>{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction variant={req?.destructive ? "destructive" : "default"} onClick={() => close(true)}>
            {req?.action ?? "Conferma"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
