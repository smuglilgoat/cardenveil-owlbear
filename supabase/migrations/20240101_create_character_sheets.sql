-- Character Sheets Table
-- Stores complete character sheet data as JSONB for flexibility
-- Uses TEXT player_id/room_id to match OBR IDs (same pattern as game_rooms)

CREATE TABLE IF NOT EXISTS character_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  room_id TEXT NOT NULL,

  -- Character metadata (denormalized for quick queries)
  name TEXT NOT NULL DEFAULT '',
  race TEXT,
  level INTEGER DEFAULT 1,

  -- Complete character sheet data as JSONB
  data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one character sheet per player per room
  CONSTRAINT unique_player_room_sheet UNIQUE (player_id, room_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_character_sheets_player ON character_sheets(player_id);
CREATE INDEX IF NOT EXISTS idx_character_sheets_room ON character_sheets(room_id);

-- Enable Row Level Security
ALTER TABLE character_sheets ENABLE ROW LEVEL SECURITY;

-- Permissive policy (same pattern as game_rooms)
-- OBR plugin contexts don't have traditional user auth
-- Validation happens server-side in Netlify Functions
CREATE POLICY "Allow all operations"
  ON character_sheets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_character_sheets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_character_sheets_updated_at_trigger ON character_sheets;
CREATE TRIGGER update_character_sheets_updated_at_trigger
  BEFORE UPDATE ON character_sheets
  FOR EACH ROW
  EXECUTE FUNCTION update_character_sheets_updated_at();

-- Enable realtime replication for live sync
ALTER PUBLICATION supabase_realtime ADD TABLE character_sheets;
