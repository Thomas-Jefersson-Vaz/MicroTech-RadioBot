-- Schema for MikroTech V3

-- Guild Settings (Configuration)
CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id VARCHAR(32) PRIMARY KEY,
    volume_preferencial INT DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Guild Users (XP System)
CREATE TABLE IF NOT EXISTS guild_users (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    xp BIGINT DEFAULT 0,
    level INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
);

-- Playback History
CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    requested_by VARCHAR(32),
    played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User Playlists
CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS playlist_items (
    id SERIAL PRIMARY KEY,
    playlist_id INT REFERENCES playlists(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    duration INT, -- in seconds
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Memory (User Context)
CREATE TABLE IF NOT EXISTS user_memories (
    user_id VARCHAR(32) PRIMARY KEY,
    memory_data JSONB, -- Stores context/facts about the user
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX idx_history_guild_id ON history(guild_id);
CREATE INDEX idx_guild_users_xp ON guild_users(guild_id, xp DESC);
