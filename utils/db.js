const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../database.sqlite');
let dbPromise;

async function getDb() {
    if (!dbPromise) {
        dbPromise = open({
            filename: dbPath,
            driver: sqlite3.Database
        });
    }
    const db = await dbPromise;
    await db.exec(`
    CREATE TABLE IF NOT EXISTS guild_users (
      guild_id TEXT,
      user_id TEXT,
      username TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      voice_xp INTEGER DEFAULT 0,
      message_xp INTEGER DEFAULT 0,
      last_xp_message_date INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      title TEXT,
      url TEXT,
      requested_by TEXT,
      played_at INTEGER
    );
  `);
    console.log("[Database] Initialized and schema verified.");
    return db;
}

// --- User/XP Methods ---
const getUser = async (guildId, userId) => {
    const db = await getDb();
    return db.get('SELECT * FROM guild_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
};

const createUser = async (guildId, userId, username) => {
    const db = await getDb();
    await db.run('INSERT OR IGNORE INTO guild_users (guild_id, user_id, username) VALUES (?, ?, ?)', guildId, userId, username);
    return getUser(guildId, userId);
};

const addXp = async (guildId, userId, amount, type = 'message') => {
    const db = await getDb();
    const colToUpdate = type === 'voice' ? 'voice_xp' : 'message_xp';

    // Ensure user exists first (logic handled in caller usually, but safe to check? We'll assume caller creates or we use UPSERT logic if sqlite version supports, but safe update is better)
    // For simplicity, we assume row exists or we run update.

    await db.run(`
        UPDATE guild_users 
        SET xp = xp + ?, 
            ${colToUpdate} = ${colToUpdate} + ? 
        WHERE guild_id = ? AND user_id = ?`,
        amount, amount, guildId, userId
    );
    return getUser(guildId, userId);
};

const setLevel = async (guildId, userId, level) => {
    const db = await getDb();
    await db.run('UPDATE guild_users SET level = ? WHERE guild_id = ? AND user_id = ?', level, guildId, userId);
};

const updateLastXpDate = async (guildId, userId, date) => {
    const db = await getDb();
    await db.run('UPDATE guild_users SET last_xp_message_date = ? WHERE guild_id = ? AND user_id = ?', date, guildId, userId);
};

const getRank = async (guildId) => {
    const db = await getDb();
    return db.all('SELECT * FROM guild_users WHERE guild_id = ? ORDER BY xp DESC LIMIT 10', guildId);
}

// --- History Methods ---
const addToHistory = async (guildId, title, url, requestedBy) => {
    const db = await getDb();
    await db.run(
        'INSERT INTO history (guild_id, title, url, requested_by, played_at) VALUES (?, ?, ?, ?, ?)',
        guildId, title, url, requestedBy, Date.now()
    );
};

const getHistory = async (guildId) => {
    const db = await getDb();
    return db.all('SELECT * FROM history WHERE guild_id = ? ORDER BY played_at DESC LIMIT 10', guildId);
};

module.exports = {
    initDb: getDb, // Exported alias for initialization
    getUser,
    createUser,
    addXp,
    setLevel,
    updateLastXpDate,
    getRank,
    addToHistory,
    getHistory
};
