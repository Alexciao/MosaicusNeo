"use client";
// Account (facoltativo): accesso, registrazione, password dimenticata, stato della sincronizzazione.

import { useState } from "react";
import { toast } from "sonner";
import { CloudCheck, CloudExclamationPoint, CloudOff, CloudSync, LoaderCircle, LogIn, LogOut, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCloud, signIn, signUp, resetPassword, updatePassword, signOut, syncNow } from "@/lib/cloud/sync";
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
    if (tab === "in") void run(async () => { await signIn(email.trim(), password); onOpenChange(false); toast.success("Accesso eseguito: sincronizzo i tuoi dati."); });
    else if (tab === "up") void run(async () => {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) setInfo("Ti ho mandato un'email: apri il link per confermare l'indirizzo, poi accedi.");
      else { onOpenChange(false); toast.success("Account creato."); }
    });
    else void run(async () => { await resetPassword(email.trim()); setInfo("Se l'indirizzo ha un account, riceverai un'email con il link per scegliere una nuova password."); });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tab === "reset" ? "Password dimenticata" : "Account Mosaicus"}</DialogTitle>
          <DialogDescription>
            {tab === "reset" ? "Scrivi l'email dell'account: ti mandiamo il link per sceglierne una nuova."
              : "Facoltativo. Con un account misure e riquadri si salvano nel cloud e li ritrovi su tutti i tuoi dispositivi. Senza, restano in questo browser."}
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
        <p className="text-xs text-muted-foreground">I dati sono visibili solo a te. Le preferenze del dispositivo (tema, modalità LIM) restano locali.</p>
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
        <DialogHeader><DialogTitle>Nuova password</DialogTitle><DialogDescription>Scegli la nuova password dell&apos;account.</DialogDescription></DialogHeader>
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
  if (status === "offline") return `Offline${pending ? `: ${pending} modifiche in attesa` : ""}. Sincronizzo appena torna la rete.`;
  if (status === "error") return `Errore di sincronizzazione${error ? `: ${error}` : ""}`;
  if (pending) return `${pending} modifiche da salvare…`;
  return lastSync ? `Sincronizzato alle ${new Date(lastSync).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Pronto";
}

export function AccountMenu() {
  const enabled = useCloud((s) => s.enabled);
  const ready = useCloud((s) => s.ready);
  const user = useCloud((s) => s.user);
  const status = useCloud((s) => s.status);
  const lastSync = useCloud((s) => s.lastSync);
  const pending = useCloud((s) => s.pending);
  const error = useCloud((s) => s.error);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;

  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setOpen(true)} aria-label="Accedi">
          <LogIn /> <span className="hidden sm:inline">Accedi</span>
        </Button>
        <AuthDialog open={open} onOpenChange={setOpen} />
        <RecoveryDialog />
      </>
    );
  }

  const Icon = status === "syncing" ? LoaderCircle : status === "offline" ? CloudOff : status === "error" ? CloudExclamationPoint : pending ? CloudSync : CloudCheck;
  const logout = async () => {
    let res = await signOut();
    if (!res.ok) {
      const go = await confirm({
        title: "Uscire senza salvare tutto?",
        description: `${res.pending} modifiche non sono ancora nel cloud (sei offline?). Se esci ora restano solo su questo dispositivo e verranno caricate al prossimo accesso con questo account.`,
        action: "Esci comunque", destructive: true,
      });
      if (!go) return;
      res = await signOut({ force: true });
    }
    toast.success("Sei uscito. I tuoi dati restano nel cloud.");
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Account" className="gap-1.5" />}>
          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary uppercase">{user.email?.[0] ?? <UserRound className="size-3.5" />}</span>
          <Icon className={cn("size-4 text-muted-foreground", status === "syncing" && "animate-spin", status === "error" && "text-destructive")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{user.email}</span>
              <span className="text-xs font-normal text-muted-foreground">{statusText(status, lastSync, pending, error)}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void syncNow({ quiet: false })}><RefreshCw /> Sincronizza ora</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void logout()}><LogOut /> Esci</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RecoveryDialog />
    </>
  );
}
