-- Character sheets: optimistic concurrency (version column + compare-and-swap RPC).
--
-- `character_sheets` was written with a whole-document `upsert`, so two frames
-- that both read a sheet and each edited a different field silently clobbered
-- each other (the later write won, nothing was raised). This mirrors the
-- `game_rooms` pattern (`version` column + `apply_game_action()`): the client
-- saves with the version it read, and the RPC answers `{conflict: true, …}`
-- when another write got there first, so `saveCharacterSheet()` can re-apply
-- its local edit on top of the newer document and retry instead of overwriting.
--
-- Apply with:  npx supabase db push --project-ref ncisbwqsupywiicaycck
--         or:  paste this file into the Supabase SQL editor
-- Idempotent: re-running it is safe. The client keeps using the old unversioned
-- upsert while this is not deployed (it detects the missing function).
--
-- The version is authoritative on the server: the client supplies only the
-- version it read (`p_expected_version`) and the function writes
-- `current_row.version + 1`, exactly like `apply_game_action`. A brand-new row
-- starts at version 1.

alter table public.character_sheets
  add column if not exists version integer not null default 0;

-- An earlier draft of this migration took `p_new_version` from the client;
-- drop that 8-argument signature so re-running this file leaves one function.
drop function if exists public.apply_character_sheet(text, text, integer, integer, jsonb, text, text, integer);

create or replace function public.apply_character_sheet(
  p_player_id text,
  p_room_id text,
  p_expected_version integer,
  p_data jsonb,
  p_name text,
  p_race text,
  p_level integer
)
returns jsonb
language plpgsql
as $function$
declare
  current_row public.character_sheets%rowtype;
  new_version integer;
begin
  select * into current_row
    from public.character_sheets
   where player_id = p_player_id
     and room_id = p_room_id;

  if not found then
    begin
      insert into public.character_sheets
        (player_id, room_id, version, data, name, race, level, updated_at)
      values
        (p_player_id, p_room_id, 1, p_data, p_name, p_race, p_level, now());
      return jsonb_build_object('version', 1, 'data', p_data);
    exception when unique_violation then
      -- Another frame created the row between the select and the insert:
      -- report it as a conflict so the client merges and retries.
      select * into current_row
        from public.character_sheets
       where player_id = p_player_id
         and room_id = p_room_id;
      return jsonb_build_object('conflict', true, 'version', current_row.version, 'data', current_row.data);
    end;
  end if;

  if current_row.version = p_expected_version then
    new_version := current_row.version + 1;
    update public.character_sheets
       set version = new_version,
           data = p_data,
           name = p_name,
           race = p_race,
           level = p_level,
           updated_at = now()
     where player_id = p_player_id
       and room_id = p_room_id;
    return jsonb_build_object('version', new_version, 'data', p_data);
  end if;

  return jsonb_build_object('conflict', true, 'version', current_row.version, 'data', current_row.data);
end;
$function$;

-- RLS is unchanged: the existing "Allow all operations" policy on
-- character_sheets already covers this function's reads and writes.
