ALTER TABLE guild_users ADD COLUMN IF NOT EXISTS last_xp_at TIMESTAMPTZ;
ALTER TABLE playlist_items ADD COLUMN IF NOT EXISTS position INT;
WITH positions AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY playlist_id ORDER BY added_at,id) AS pos FROM playlist_items WHERE position IS NULL)
UPDATE playlist_items SET position = positions.pos FROM positions WHERE playlist_items.id = positions.id;
CREATE INDEX IF NOT EXISTS idx_playlist_order ON playlist_items(playlist_id,position,id);
CREATE TABLE IF NOT EXISTS conversation_memories (
    guild_id VARCHAR(32) NOT NULL, user_id VARCHAR(32) NOT NULL,
    turns JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_memory_expiry ON conversation_memories(updated_at);
