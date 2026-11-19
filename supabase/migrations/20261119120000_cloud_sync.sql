-- Mosaicus: sincronizzazione nel cloud dei dati di ogni account.
--  • sessions: le misure del Quaderno (righe grezze e parametri)
--  • boxes:    i riquadri di Elaborazione (dati, colonne calcolate, analisi)
--  • settings: le preferenze dei lab (parametri, synth, oscilloscopio…)
-- Ogni utente vede e modifica solo le proprie righe (Row Level Security).
-- Le cancellazioni sono "lapidi" (deleted = true), così arrivano anche agli altri dispositivi.

create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.boxes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index sessions_user_updated on public.sessions (user_id, updated_at);
create index boxes_user_updated on public.boxes (user_id, updated_at);

-- l'ora di modifica la decide il server: i dispositivi chiedono "cosa è cambiato dopo…"
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sessions_touch before insert or update on public.sessions for each row execute function public.touch_updated_at();
create trigger boxes_touch before insert or update on public.boxes for each row execute function public.touch_updated_at();
create trigger settings_touch before insert or update on public.settings for each row execute function public.touch_updated_at();

alter table public.sessions enable row level security;
alter table public.boxes enable row level security;
alter table public.settings enable row level security;

create policy "sessions: solo le proprie" on public.sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "boxes: solo i propri" on public.boxes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "settings: solo le proprie" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
