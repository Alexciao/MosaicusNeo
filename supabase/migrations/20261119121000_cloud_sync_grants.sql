-- Accesso alle tabelle dall'API (Data API): solo agli utenti autenticati, sempre filtrato
-- dalle regole di Row Level Security. Gli utenti anonimi non vedono nulla.
grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.boxes to authenticated;
grant select, insert, update, delete on table public.settings to authenticated;
grant all on table public.sessions, public.boxes, public.settings to service_role;
