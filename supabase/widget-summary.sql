-- Already applied through the add_read_only_iphone_widget migration.
create table public.widget_devices (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default (now()+interval '90 days')
    check (expires_at <= now()+interval '91 days')
);
alter table public.widget_devices enable row level security;
revoke all on public.widget_devices from public,anon,authenticated;
grant select,insert,update,delete on public.widget_devices to authenticated;
grant select on public.widget_devices to service_role;
create policy "Manage own widget key" on public.widget_devices for all to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));

CREATE OR REPLACE FUNCTION public.get_widget_summary(p_token_hash text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ with device as (select owner_id from public.widget_devices where token_hash=p_token_hash and expires_at>now()), day as (select (now() at time zone 'Asia/Tokyo')::date as today), events as (select left(s.name,200) as name, left(coalesce(s.time,''),5) as time, coalesce(s.person,'家族全員') as source from public.schedules s,device,day where s.owner_id=device.owner_id and s.date=day.today union all select left(i.item->>'name',200),left(coalesce(i.item->>'time',''),5),left(coalesce(i.item->>'source_name','Appleから同期'),100) from public.apple_sync_snapshots a join device on a.owner_id=device.owner_id cross join day cross join lateral jsonb_array_elements(a.items) i(item) where a.source='schedules' and i.item->>'date'=day.today::text), task_count as (select (select count(*) from public.tasks t,device where t.owner_id=device.owner_id and not coalesce(t.done,false))+(select count(*) from public.apple_sync_snapshots a join device on a.owner_id=device.owner_id cross join lateral jsonb_array_elements(a.items) i(item) where a.source='tasks' and coalesce(i.item->>'done','false')<>'true') as count), shop_count as (select (select count(*) from public.shopping t,device where t.owner_id=device.owner_id and not coalesce(t.done,false))+(select count(*) from public.apple_sync_snapshots a join device on a.owner_id=device.owner_id cross join lateral jsonb_array_elements(a.items) i(item) where a.source='shopping' and coalesce(i.item->>'done','false')<>'true') as count) select case when exists(select 1 from device) then jsonb_build_object('version',1,'date',(select today::text from day),'timezone','Asia/Tokyo','generated_at',now(),'schedule_count',(select count(*) from events),'schedules',coalesce((select jsonb_agg(to_jsonb(e) order by e.time,e.name) from (select * from events order by time,name limit 12)e),'[]'::jsonb),'task_count',(select count from task_count),'shopping_count',(select count from shop_count),'sync_times',coalesce((select jsonb_object_agg(a.source,a.synced_at) from public.apple_sync_snapshots a join device on a.owner_id=device.owner_id),'{}'::jsonb)) else null end $function$

revoke all on function public.get_widget_summary(text) from public,anon,authenticated;
grant execute on function public.get_widget_summary(text) to service_role;

