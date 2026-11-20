"use client";
// Account (facoltativo): accesso, registrazione, password dimenticata, stato della sincronizzazione.

import { useState } from "react";
import { toast } from "@/lib/toast";
import { useTranslations } from "next-intl";
import { t as tr, intlLocale } from "@/i18n";
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
import { openPrivacy } from "./privacy-dialog";

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
  const t = useTranslations("app.account");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(""); setInfo("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "in") void run(async () => { await signIn(email.trim(), password); onOpenChange(false); toast.success(t("signedIn")); });
    else if (tab === "up") void run(async () => {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) setInfo(t("confirmSent"));
      else { onOpenChange(false); toast.success(t("created")); }
    });
    else void run(async () => { await resetPassword(email.trim()); setInfo(t("resetSent")); });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tab === "reset" ? t("forgotTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {tab === "reset" ? t("resetDesc") : t("desc")}
          </DialogDescription>
        </DialogHeader>
        {tab !== "reset" && (
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "in" | "up"); setError(""); setInfo(""); }}>
            <TabsList className="w-full"><TabsTrigger value="in">{t("signIn")}</TabsTrigger><TabsTrigger value="up">{t("signUp")}</TabsTrigger></TabsList>
            <TabsContent value="in" /><TabsContent value="up" />
          </Tabs>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field id="auth-email" label={t("email")} type="email" autoComplete="email" spellCheck={false} autoCapitalize="none" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {tab !== "reset" && (
            <Field id="auth-password" label={t("password")} type="password" required minLength={6}
              autoComplete={tab === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {info && <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{info}</p>}
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            {tab === "in" ? t("signIn") : tab === "up" ? t("submitUp") : t("submitReset")}
          </Button>
          {tab === "in" && <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setTab("reset"); setError(""); setInfo(""); }}>{t("forgot")}</Button>}
          {tab === "reset" && <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setTab("in"); setError(""); setInfo(""); }}>{t("back")}</Button>}
        </form>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t.rich(tab === "up" ? "consentUp" : "consentIn", {
            link: (c) => <button type="button" onClick={openPrivacy} className="text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground">{c}</button>,
          })}
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
  const t = useTranslations("app.account.delete");
  const match = !!email && typed.trim().toLowerCase() === email.toLowerCase();
  const change = (o: boolean) => { if (busy) return; onOpenChange(o); if (!o) { setTyped(""); setError(""); } };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t.rich("item1", { email, b: (c) => <b className="font-semibold">{c}</b> })}</li>
          <li>{t("item2")}</li>
          <li>{t("item3")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">{t("keep")}</p>
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!match) return;
          setBusy(true); setError("");
          try {
            await deleteAccount();
            onOpenChange(false); setTyped("");
            toast.success(t("done"));
          } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>
          <Field id="delete-confirm" label={t("confirmLabel")} type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={() => change(false)}>{t("cancel")}</Button>
            <Button type="submit" variant="destructive" disabled={!match || busy}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Trash />} {t("submit")}
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
  const t = useTranslations("app.account.recovery");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog open={recovery} onOpenChange={(o) => { if (!o) useCloud.setState({ recovery: false }); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription>{t("desc")}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setError("");
          try { await updatePassword(password); toast.success(t("done")); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
        }}>
          <Field id="new-password" label={t("label")} type="password" minLength={6} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />} {t("save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Short form for the sidebar card: icon + time, or a single word. */
function statusShort(status: string, lastSync: number | null, pending: number) {
  if (status === "syncing") return tr("app.account.status.short.syncing");
  if (status === "offline") return tr("app.account.status.short.offline");
  if (status === "error") return tr("app.account.status.short.error");
  if (pending) return tr("app.account.status.short.pending", { n: pending });
  return lastSync ? new Date(lastSync).toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" }) : tr("app.account.status.ready");
}

function statusText(status: string, lastSync: number | null, pending: number, error: string | null) {
  if (status === "syncing") return tr("app.account.status.syncing");
  if (status === "offline") return tr("app.account.status.offline", { pending });
  if (status === "error") return error ? tr("app.account.status.errorWith", { error }) : tr("app.account.status.error");
  if (pending) return tr("app.account.status.pending", { n: pending });
  return lastSync
    ? tr("app.account.status.synced", { time: new Date(lastSync).toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" }) })
    : tr("app.account.status.ready");
}

/** Uscita dall'account: con modifiche non ancora nel cloud chiede conferma. */
async function logout() {
  let res = await signOut();
  if (!res.ok) {
    const go = await confirm({
      title: tr("app.account.logout.title"),
      description: tr("app.account.logout.desc", { n: res.pending ?? 0 }),
      action: tr("app.account.logout.action"), destructive: true,
    });
    if (!go) return;
    res = await signOut({ force: true });
  }
  toast.success(tr("app.account.logout.done"));
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
  return { enabled, ready, user, status, text: statusText(status, lastSync, pending, error), short: statusShort(status, lastSync, pending), Icon, iconClass };
}

/** Le voci del menu dell'account (intestazione e barra laterale). */
function AccountItems({ onDelete }: { onDelete: () => void }) {
  const t = useTranslations("app.account.menu");
  return (
    <>
      <DropdownMenuItem onClick={() => void syncNow({ quiet: false })}><RefreshCw /> {t("syncNow")}</DropdownMenuItem>
      <DropdownMenuItem onClick={openPrivacy}><ShieldCheck /> {t("privacy")}</DropdownMenuItem>
      <DropdownMenuItem onClick={() => void logout()}><LogOut /> {t("signOut")}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash /> {t("delete")}</DropdownMenuItem>
    </>
  );
}

const Avatar = ({ email, className }: { email?: string; className?: string }) => (
  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-xs font-medium text-foreground uppercase", className)}>{email?.[0] ?? <UserRound className="size-3.5" />}</span>
);

/** Nell'intestazione (dove la barra laterale non c'è: altre pagine, telefono). */
export function AccountMenu({ className }: { className?: string }) {
  const { enabled, ready, user, text, Icon, iconClass } = useAccount();
  const t = useTranslations("app.account");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!enabled) return null;

  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setOpen(true)} aria-label={t("signIn")} className={className}>
          <LogIn /> <span className="hidden sm:inline">{t("signIn")}</span>
        </Button>
        <AuthDialog open={open} onOpenChange={setOpen} />
        <RecoveryDialog />
      </>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={t("menu.label")} className={cn("gap-1.5", className)} />}>
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
  const { enabled, ready, user, status, text, short, Icon, iconClass } = useAccount();
  const t = useTranslations("app.account");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!enabled) return null;

  if (!user) {
    return (
      <>
        {/* l'account è facoltativo: senza accesso basta un pulsante discreto */}
        <Button variant="ghost" size="sm" disabled={!ready} onClick={() => setOpen(true)} className="w-full justify-start text-muted-foreground">
          <LogIn /> {t("signIn")}
        </Button>
        <AuthDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <button type="button" aria-label={t("menu.label")}
            className="flex w-full items-center gap-2.5 rounded-md border bg-background/60 p-2.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent" />
        }>
          <Avatar email={user.email} className="size-8 text-sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{user.email}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={text}>
              <Icon className={cn("size-3.5 shrink-0", iconClass)} />
              <span className="truncate tabular">{short}</span>
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{status === "off" ? t("menu.label") : text}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <AccountItems onDelete={() => setDeleting(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} email={user.email ?? ""} />
    </>
  );
}
