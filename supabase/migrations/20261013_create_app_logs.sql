-- App-level logging sink: technical errors and lifecycle events from every
-- Cardenveil frame (main panel, hand popover, sheet popover, background, dice).
--
-- Apply with:  npx supabase db push --project-ref <ref>   (or paste in the SQL editor)
-- Read with:   select created_at, level, source, event, message, room_id, player_id, detail
--              from app_logs order by created_at desc limit 100;
-- Filter one player:  ... where player_id = '<id>' order by created_at desc;
-- Errors only:        ... where level = 'error' order by created_at desc;

create table if not exists public.app_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null default 'error',
  source text not null default 'app',
  event text not null,
  message text,
  detail jsonb,
  room_id text,
  player_id text,
  player_name text,
  app_version text,
  viewport text
);

create index if not exists app_logs_created_at_idx on public.app_logs (created_at desc);
create index if not exists app_logs_level_idx on public.app_logs (level, created_at desc);

-- Permissive policy (same pattern as game_rooms / character_sheets: the plugin
-- is anonymous, there is no auth layer to key on).
alter table public.app_logs enable row level security;
drop policy if exists "Allow all" on public.app_logs;
create policy "Allow all" on public.app_logs for all using (true) with check (true);

-- Bounded storage without a cron job: drop rows older than 30 days on insert.
create or replace function public.prune_app_logs() returns trigger
language plpgsql as $$
begin
  delete from public.app_logs where created_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists app_logs_prune on public.app_logs;
create trigger app_logs_prune
  after insert on public.app_logs
  for each row execute function public.prune_app_logs();
