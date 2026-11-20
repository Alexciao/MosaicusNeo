"use client";
// Account (facoltativo): accesso, registrazione, password dimenticata, stato della sincronizzazione.

import { useState } from "react";
import { toast } from "sonner";
import { ChevronsUpDown, CloudCheck, CloudExclamationPoint, CloudOff, CloudSync, LoaderCircle, LogIn, LogOut, RefreshCw, ShieldCheck, Trash, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCloud, signIn, signUp, resetPassword, updatePassword, signOut, syncNow, deleteAccount } from "@/lib/cloud/sync";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

function AuthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setInfo("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "in") void run(async () => { await signIn(email.trim(), password); onOpenChange(false); toast.success("Accesso eseguito. Sincronizzazione in corso."); });
    else if (tab === "up") void run(async () => {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) setInfo("Email di conferma inviata. Apri il link, poi accedi.");
      else { onOpenChange(false); toast.success("Account creato."); }
    });
    else void run(async () => { await resetPassword(email.trim()); setInfo("Se l'indirizzo ha un account, riceverai un'email con il link."); });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tab === "reset" ? "Password dimenticata" : "Account MosaicusNeo"}</DialogTitle>
          <DialogDescription>
            {tab === "reset" ? "Inserisci l'email dell'account: riceverai un link per scegliere una nuova password."
              : "Facoltativo. Con un account misure e riquadri si salvano nel cloud e sono disponibili su ogni dispositivo. Senza, restano in questo browser."}
          </DialogDescription>
        </DialogHeader>
        {tab !== "reset" && (
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "in" | "up"); setError(""); setInfo(""); }}>
            <TabsList className="w-full"><TabsTrigger value="in">Accedi</TabsTrigger><TabsTrigger value="up">Crea un account</TabsTrigger></TabsList>
            <TabsContent value="in" /><TabsContent value="up" />
          </Tabs>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field id="auth-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {tab !== "reset" && (
            <Field id="auth-password" label="Password" type="password" required minLength={6}
              autoComplete={tab === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {info && <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{info}</p>}
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            {tab === "in" ? "Accedi" : tab === "up" ? "Crea l'account" : "Mandami il link"}
          </Button>
          {tab === "in" && <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setTab("reset"); setError(""); setInfo(""); }}>Password dimenticata?</Button>}
          {tab === "reset" && <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setTab("in"); setError(""); setInfo(""); }}>Torna all&apos;accesso</Button>}
        </form>
        <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-foreground" />
          <span>
            {tab === "up" ? "Creando l'account accetti il trattamento descritto nell'" : "I dati dell'account sono visibili solo a te. Leggi l'"}
            <a href="/privacy" target="_blank" rel="noopener" className="font-medium text-foreground underline underline-offset-2">informativa sulla privacy</a>.
          </span>
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Cancellazione dell'account: si conferma scrivendo la propria email. Avviene subito e del tutto. */
function DeleteAccountDialog({ open, onOpenChange, email }: { open: boolean; onOpenChange: (o: boolean) => void; email: string }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const match = !!email && typed.trim().toLowerCase() === email.toLowerCase();
  const change = (o: boolean) => { if (busy) return; onOpenChange(o); if (!o) { setTyped(""); setError(""); } };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare l&apos;account?</DialogTitle>
          <DialogDescription>Avviene subito e non si può annullare. Vengono cancellati:</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>l&apos;account e l&apos;indirizzo <b className="font-semibold">{email}</b>;</li>
          <li>tutte le misure, i riquadri, i progetti e le preferenze salvati nel cloud;</li>
          <li>le loro copie su questo dispositivo.</li>
        </ul>
        <p className="text-sm text-muted-foreground">Se vuoi conservare qualcosa, esportalo prima in Excel o CSV. Sugli altri dispositivi le copie locali restano finché non esci dall&apos;account.</p>
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!match) return;
          setBusy(true); setError("");
          try {
            await deleteAccount();
            onOpenChange(false); setTyped("");
            toast.success("Account eliminato. I dati sono stati cancellati.");
          } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>
          <Field id="delete-confirm" label="Per confermare, scrivi la tua email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>Annulla</Button>
            <Button type="submit" variant="destructive" disabled={!match || busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Trash />} Elimina definitivamente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Dopo il link di "password dimenticata": si sceglie la nuova password. */
function RecoveryDialog() {
  const recovery = useCloud((s) => s.recovery);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open={recovery} onOpenChange={(o) => { if (!o) useCloud.setState({ recovery: false }); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Nuova password</DialogTitle><DialogDescription>Almeno 6 caratteri.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError("");
          try { await updatePassword(password); toast.success("Password aggiornata."); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>
          <Field id="new-password" label="Nuova password" type="password" minLength={6} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />} Salva</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusText(status: string, lastSync: number | null, pending: number, error: string | null) {
  if (status === "syncing") return "Sincronizzazione in corso…";
  if (status === "offline") return `Offline${pending ? ` · ${pending} modifiche in attesa` : ""}. La sincronizzazione riprende con la rete.`;
  if (status === "error") return `Errore di sincronizzazione${error ? `: ${error}` : ""}`;
  if (pending) return `${pending} modifiche da sincronizzare`;
  return lastSync ? `Sincronizzato alle ${new Date(lastSync).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Pronto";
}

/** Uscita dall'account: con modifiche non ancora nel cloud chiede conferma. */
async function logout() {
  let res = await signOut();
  if (!res.ok) {
    const go = await confirm({
      title: "Uscire con modifiche non sincronizzate?",
      description: `${res.pending} modifiche non sono ancora nel cloud. Restano su questo dispositivo e vengono caricate al prossimo accesso con questo account.`,
      action: "Esci comunque", destructive: true,
    });
    if (!go) return;
    res = await signOut({ force: true });
  }
  toast.success("Disconnesso. I dati restano nel cloud.");
}

/** Stato del cloud per l'account: icona e testo della sincronizzazione. */
function useAccount() {
  const enabled = useCloud((s) => s.enabled);
  const ready = useCloud((s) => s.ready);
  const user = useCloud((s) => s.user);
  const status = useCloud((s) => s.status);
  const lastSync = useCloud((s) => s.lastSync);
  const pending = useCloud((s) => s.pending);
  const error = useCloud((s) => s.error);
  const Icon = status === "syncing" ? LoaderCircle : status === "offline" ? CloudOff : status === "error" ? CloudExclamationPoint : pending ? CloudSync : CloudCheck;
  const iconClass = cn(status === "syncing" && "animate-spin", status === "error" && "text-destructive");
  return { enabled, ready, user, status, text: statusText(status, lastSync, pending, error), Icon, iconClass };
}

/** Le voci del menu dell'account (intestazione e barra laterale). */
function AccountItems({ onDelete }: { onDelete: () => void }) {
  return (
    <>
      <DropdownMenuItem onClick={() => void syncNow({ quiet: false })}><RefreshCw /> Sincronizza ora</DropdownMenuItem>
      <DropdownMenuItem render={<a href="/privacy" target="_blank" rel="noopener" />}><ShieldCheck /> Privacy</DropdownMenuItem>
      <DropdownMenuItem onClick={() => void logout()}><LogOut /> Esci</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash /> Elimina account</DropdownMenuItem>
    </>
  );
}

const Avatar = ({ email, className }: { email?: string; className?: string }) => (
  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand uppercase", className)}>{email?.[0] ?? <UserRound className="size-3.5" />}</span>
);

/** Nell'intestazione (dove la barra laterale non c'è: altre pagine, telefono). */
export function AccountMenu({ className }: { className?: string }) {
  const { enabled, ready, user, text, Icon, iconClass } = useAccount();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!enabled) return null;

  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setOpen(true)} aria-label="Accedi" className={className}>
          <LogIn /> <span className="hidden sm:inline">Accedi</span>
        </Button>
        <AuthDialog open={open} onOpenChange={setOpen} />
        <RecoveryDialog />
      </>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Account" className={cn("gap-1.5", className)} />}>
          <Avatar email={user.email} />
          <Icon className={cn("size-4 text-muted-foreground", iconClass)} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{user.email}</span>
              <span className="text-xs font-normal text-muted-foreground">{text}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <AccountItems onDelete={() => setDeleting(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} email={user.email ?? ""} />
      <RecoveryDialog />
    </>
  );
}

/** In fondo alla barra laterale dei lab: l'account come scheda. */
export function AccountCard() {
  const { enabled, ready, user, status, text, Icon, iconClass } = useAccount();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!enabled) return null;

  if (!user) {
    return (
      <>
        {/* l'account è facoltativo: senza accesso basta un pulsante discreto */}
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setOpen(true)} className="w-full justify-start text-muted-foreground">
          <LogIn /> Accedi
        </Button>
        <AuthDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <button type="button" aria-label="Account"
            className="flex w-full items-center gap-2.5 rounded-lg border bg-background/60 p-2.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent" />
        }>
          <Avatar email={user.email} className="size-8 text-sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.email}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Icon className={cn("size-3.5 shrink-0", iconClass)} />
              <span className="truncate">{text}</span>
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{status === "off" ? "Account" : text}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <AccountItems onDelete={() => setDeleting(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} email={user.email ?? ""} />
    </>
  );
}
