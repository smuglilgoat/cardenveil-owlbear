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
-- `p_new_version` is supplied by the client (as in `apply_game_action`) so the
-- response can be built without re-reading the row.

alter table public.character_sheets
  add column if not exists version integer not null default 0;

create or replace function public.apply_character_sheet(
  p_player_id text,
  p_room_id text,
  p_expected_version integer,
  p_new_version integer,
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
        (p_player_id, p_room_id, p_new_version, p_data, p_name, p_race, p_level, now());
      return jsonb_build_object('version', p_new_version, 'data', p_data);
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
    update public.character_sheets
       set version = p_new_version,
           data = p_data,
           name = p_name,
           race = p_race,
           level = p_level,
           updated_at = now()
     where player_id = p_player_id
       and room_id = p_room_id;
    return jsonb_build_object('version', p_new_version, 'data', p_data);
  end if;

  return jsonb_build_object('conflict', true, 'version', current_row.version, 'data', current_row.data);
end;
$function$;

-- RLS is unchanged: the existing "Allow all operations" policy on
-- character_sheets already covers this function's reads and writes.
