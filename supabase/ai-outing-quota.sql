-- Already applied through Supabase migrations. Recorded here for review.
create or replace function public.consume_ai_request()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage(owner_id,usage_date,request_count)
    values(auth.uid(),today,1)
    on conflict(owner_id,usage_date) do update
      set request_count=public.ai_usage.request_count+1
      where public.ai_usage.request_count<10
    returning request_count into n;
  return n is not null;
end;
$$;
revoke all on function public.consume_ai_request() from public,anon;
grant execute on function public.consume_ai_request() to authenticated;
revoke all on public.ai_usage from anon,authenticated;
grant select on public.ai_usage to authenticated;
