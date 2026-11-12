-- Already applied through the cache_outing_forecasts_server_only migration.
create table public.outing_weather_cache (
  cache_key text primary key,
  data jsonb not null,
  expires_at timestamptz not null
);
alter table public.outing_weather_cache enable row level security;
revoke all on public.outing_weather_cache from public,anon,authenticated;
grant select,insert,update,delete on public.outing_weather_cache to service_role;
create index outing_weather_cache_expiry_idx on public.outing_weather_cache(expires_at);
