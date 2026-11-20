"use client";
// Un pannello che sul telefono è un cassetto dal basso (si trascina giù per chiuderlo, come le
// app native) e su schermi più larghi un pannello laterale.

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function ResponsivePanel({ open, onOpenChange, title, description, side = "right", className, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string;
  side?: "left" | "right"; className?: string; children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {/* il contenuto scorre dentro il cassetto; lo spazio in fondo evita la barra del telefono */}
          <div className={cn("min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]", className)}>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-full overflow-x-hidden overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className={cn("px-4 pb-8", className)}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}
