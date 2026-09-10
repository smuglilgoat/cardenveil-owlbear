-- Character sheet assets bucket
-- Sheets imported as .zip archives carry their images in assets/<sheetId>/
-- (portrait.png, totem.png, capacity-N.png). The importer uploads each file
-- here and rewrites the sheet's image fields to public URLs.
--
-- Path scheme: {roomId}/{playerId}/{fileName}
--   - scoped per room + player, mirroring the character_sheets unique key
--   - re-importing a sheet upserts the same paths (idempotent, no orphans)
--   - URLs stored in the sheet carry a ?v=<timestamp> cache-buster
--
-- Public read so <img src> works with plain URLs (no signed requests).
-- Permissive writes: same "Allow all" convention as every table here —
-- OBR plugin contexts have no traditional user auth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'character-assets',
  'character-assets',
  true,
  5242880, -- 5 MB per file (portrait/totem/capacity art)
  '["image/png","image/jpeg","image/webp","image/gif"]'::jsonb
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Permissive policy (same pattern as game_rooms / character_sheets)
DROP POLICY IF EXISTS "Allow all character assets" ON storage.objects;
CREATE POLICY "Allow all character assets"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'character-assets')
  WITH CHECK (bucket_id = 'character-assets');
