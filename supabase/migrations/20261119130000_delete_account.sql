-- Cancellazione dell'account dall'app (GDPR, art. 17): l'utente collegato elimina se stesso,
-- subito e del tutto. Misure, riquadri e preferenze si cancellano qui in modo esplicito; la riga in
-- auth.users porta con sé identità, sessioni e token (e, per sicurezza, le tabelle hanno comunque
-- "on delete cascade"). Gira con i diritti del proprietario (security definer) ma agisce solo
-- sull'utente che la chiama: auth.uid().
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'non autenticato' using errcode = '28000';
  end if;
  delete from public.sessions where user_id = me;
  delete from public.boxes where user_id = me;
  delete from public.settings where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
