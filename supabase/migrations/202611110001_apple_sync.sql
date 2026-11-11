begin;
-- Run in Supabase SQL Editor. Existing family data is left untouched.
create table public.apple_sync_devices (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default (now() + interval '90 days')
    check (expires_at <= now() + interval '91 days')
);
create table public.apple_sync_snapshots (
  owner_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('schedules','shopping','tasks')),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  captured_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (owner_id, source)
);
alter table public.apple_sync_devices enable row level security;
alter table public.apple_sync_snapshots enable row level security;
revoke all on public.apple_sync_devices, public.apple_sync_snapshots from anon, authenticated;
grant select, insert, update, delete on public.apple_sync_devices to authenticated;
grant select on public.apple_sync_snapshots to authenticated;
grant all on public.apple_sync_devices, public.apple_sync_snapshots to service_role;
create policy "Own sync device" on public.apple_sync_devices for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Read own imported information" on public.apple_sync_snapshots for select to authenticated
  using (owner_id = (select auth.uid()));
-- Single transaction: authenticate the sending device, then replace supplied lists.
-- Absent sources stay unchanged. An explicitly supplied [] clears only that import.
create function public.receive_apple_snapshot(p_hash text, p_captured_at timestamptz, p_sources jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare device public.apple_sync_devices; entry record;
begin
  select * into device from public.apple_sync_devices
    where token_hash = p_hash and expires_at > now() for update;
  if not found then raise exception 'Invalid or expired sync key' using errcode = '28000'; end if;
  if p_captured_at > now() + interval '5 minutes' or p_captured_at < now() - interval '1 day' then
    raise exception 'Snapshot timestamp out of range';
  end if;
  for entry in select * from jsonb_each(p_sources) loop
    insert into public.apple_sync_snapshots(owner_id, source, items, captured_at)
      values (device.owner_id, entry.key, entry.value, p_captured_at)
    on conflict (owner_id, source) do update
      set items = excluded.items, captured_at = excluded.captured_at, synced_at = now()
      where public.apple_sync_snapshots.captured_at < excluded.captured_at;
  end loop;
end;
$$;
revoke all on function public.receive_apple_snapshot(text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.receive_apple_snapshot(text,timestamptz,jsonb) to service_role;

commit;
