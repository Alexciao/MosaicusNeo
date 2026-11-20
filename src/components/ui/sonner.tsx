"use client"
// Notifiche (Sonner) con lo stile dell'app: scheda chiara, icona del tipo in un tondo colorato,
// titolo e descrizione separati, azione come un pulsante vero. Si chiudono da sole o con uno
// scorrimento: niente pulsante di chiusura.

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheck, Info, TriangleAlert, CircleAlert, LoaderCircle } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      gap={10}
      visibleToasts={4}
      offset={20}
      // sul telefono sopra la barra di navigazione in basso
      mobileOffset={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))", left: 12, right: 12 }}
      icons={{
        success: <CircleCheck />,
        info: <Info />,
        warning: <TriangleAlert />,
        error: <CircleAlert />,
        loading: <LoaderCircle className="animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast flex w-full items-start gap-3 rounded-xl border bg-popover p-3.5 pr-4 text-popover-foreground shadow-[0_8px_30px_-6px_rgb(0_0_0/0.18)] ring-1 ring-black/[0.03] font-sans sm:w-(--width) dark:shadow-[0_8px_30px_-6px_rgb(0_0_0/0.6)] dark:ring-white/[0.04]",
          icon:
            "mt-px grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground [&>svg]:size-3.5 " +
            "group-data-[type=success]/toast:bg-success/12 group-data-[type=success]/toast:text-success " +
            "group-data-[type=error]/toast:bg-destructive/12 group-data-[type=error]/toast:text-destructive " +
            "group-data-[type=warning]/toast:bg-warning/15 group-data-[type=warning]/toast:text-warning " +
            "group-data-[type=info]/toast:bg-sky-500/12 group-data-[type=info]/toast:text-sky-600 dark:group-data-[type=info]/toast:text-sky-400",
          content: "flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5",
          title: "text-sm leading-5 font-medium text-pretty",
          description: "text-[0.8rem] leading-snug text-muted-foreground text-pretty",
          actionButton:
            "mt-px ml-1 inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          cancelButton:
            "mt-px inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
