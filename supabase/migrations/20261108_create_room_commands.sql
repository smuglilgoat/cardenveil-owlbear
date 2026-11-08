-- Command channel between the standalone sheet tab (issue #14) and the room's
-- Owlbear frames.
--
-- WHY A TABLE AND NOT BroadcastChannel: a tab on the plugin's origin and the
-- Owlbear frames (the same origin, but embedded in www.owlbear.rodeo) do NOT
-- share a storage partition — Chrome partitions BroadcastChannel AND
-- localStorage by top-level site. Measured: a cross-site iframe receives
-- neither the parent's BroadcastChannel messages nor its localStorage. So the
-- tab cannot talk to the frames in-browser, nor borrow their actor credential.
-- Supabase is a network hop, so it crosses that boundary.
--
-- The tab INSERTs a command; the room's frames read it over postgres_changes
-- and act with their OWN credentials (the tab must never write game_rooms —
-- it holds no token the server would accept).
create table if not exists public.room_commands (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  -- HMAC of (kind, room_id, payload) with the secret the room handed to the
  -- tab: the table is readable and writable by anyone holding the anon key,
  -- so a command must prove it came from the tab the room opened.
  signature text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_room_commands_room on public.room_commands (room_id, created_at desc);

alter table public.room_commands enable row level security;
drop policy if exists "Allow all operations" on public.room_commands;
create policy "Allow all operations" on public.room_commands for all using (true) with check (true);

-- Realtime delivery (postgres_changes) — the publication is not ALLTABLES.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_commands'
  ) then
    alter publication supabase_realtime add table public.room_commands;
  end if;
end $$;

-- The rows are a delivery vehicle, not a log: the executor drops each row when
-- it reads it, and this trigger is the safety net for rows nobody read (the
-- sender closed its tab). Mirrors the app_logs prune.
create or replace function public.prune_room_commands() returns trigger
language plpgsql as $$
begin
  delete from public.room_commands where created_at < now() - interval '1 hour';
  return null;
end;
$$;

drop trigger if exists room_commands_prune on public.room_commands;
create trigger room_commands_prune
  after insert on public.room_commands
  for each row execute function public.prune_room_commands();
