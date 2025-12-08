const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { getSession, resolveSongMetadata } = require('./utils/playerManager');
const { AudioPlayerStatus } = require('@discordjs/voice');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // 1. Check Admin Password
    if (authHeader === process.env.DASHBOARD_PASSWORD) {
        return next();
    }

    // 2. Check Discord Token
    if (activeTokens.has(authHeader)) {
        return next();
    }

    return res.status(401).json({ error: 'Unauthorized' });
};

// Root route
app.get('/', (req, res) => {
    res.send('Dashboard API is running');
});

let discordClient = null;

// Initialize function to pass the client
const initApi = (client) => {
    discordClient = client;
    app.listen(PORT, () => {
        console.log(`[Dashboard API] Running on http://localhost:${PORT}`);
    });
};

// --- Endpoints ---

// 0. Auth Check
app.post('/api/auth/verify', (req, res) => {
    const { password } = req.body;
    if (password === process.env.DASHBOARD_PASSWORD) {
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid password' });
});

// Discord OAuth Config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const activeTokens = new Map(); // Map<token, { user: any, guilds: string[] }>

app.post('/api/auth/discord/url', (req, res) => {
    const { redirectUri } = req.body;
    if (!CLIENT_ID) return res.status(500).json({ error: 'Missing Client ID' });

    // Scopes: identify (username/avatar), guilds (server list)
    const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.json({ url });
});

app.post('/api/auth/discord/callback', async (req, res) => {
    const { code, redirectUri } = req.body;
    if (!code || !redirectUri) return res.status(400).json({ error: 'Missing code or redirectUri' });

    try {
        const params = new URLSearchParams();
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);

        // Exchange code for token
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;

        // Get User Info
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        // Get User Guilds
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const userGuilds = guildsResponse.data.map(g => g.id);

        activeTokens.set(access_token, {
            user: userResponse.data,
            guilds: userGuilds
        });

        console.log('[Auth] New Discord session added for:', userResponse.data.username);

        res.json({
            token: access_token,
            user: userResponse.data
        });

    } catch (error) {
        console.error('Discord Auth Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// 1. Get Active Sessions
app.get('/api/sessions', authMiddleware, (req, res) => {
    if (!discordClient) return res.status(503).json({ error: 'Client not ready' });

    const authHeader = req.headers.authorization;
    let allowedGuilds = null; // null means ALL (Admin)

    // Check if it's a Discord Token
    if (activeTokens.has(authHeader)) {
        allowedGuilds = activeTokens.get(authHeader).guilds;
    }

    const sessions = [];
    discordClient.guilds.cache.forEach(guild => {
        // Filter: If we have an allowedGuilds list, check if this guild is in it
        if (allowedGuilds && !allowedGuilds.includes(guild.id)) {
            return;
        }

        const session = getSession(guild.id);
        // We consider a session "active" if it has a connection or a queue
        if (session.connection || session.queue.length > 0 || session.currentSong) {
            sessions.push({
                id: guild.id,
                name: guild.name,
                icon: guild.iconURL(),
                memberCount: guild.memberCount
            });
        }
    });

    res.json(sessions);
});

// 2. Get Queue & Status
app.get('/api/queue/:guildId', authMiddleware, (req, res) => {
    const { guildId } = req.params;
    const session = getSession(guildId);

    // Calculate accurate position
    let position = 0;
    if (session.player && session.player.state.status === AudioPlayerStatus.Playing && session.player.state.resource) {
        // playbackDuration is in ms
        position = (session.startOffset * 1000) + session.player.state.resource.playbackDuration;
    } else if (session.player && session.player.state.status === AudioPlayerStatus.Paused && session.player.state.resource) {
        // Even when paused, resource preserves duration processed so far
        position = (session.startOffset * 1000) + session.player.state.resource.playbackDuration;
    }

    res.json({
        currentSong: session.currentSong,
        queue: session.queue,
        isPlaying: session.player.state.status === AudioPlayerStatus.Playing,
        volume: session.volume,
        filters: session.filters,
        playbackStartTime: session.playbackStartTime,
        position: position // Current position in ms
    });
});

// 3. Add to Queue
app.post('/api/queue/:guildId/add', authMiddleware, async (req, res) => {
    const { guildId } = req.params;
    const { url, title, requestedBy } = req.body;
    console.log(`[API] Add request received. URL: "${url}", RequestedBy: "${requestedBy}"`);
    const session = getSession(guildId);

    // Basic object, normally you'd resolve this before adding if strictly needed,
    // but the playerManager resolves it on play. 
    // Ideally, we accept a raw URL and let the bot resolve it, OR we pass a pre-resolved object.
    // For simplicity, we assume the frontend sends a URL and we just queue it.
    // BUT the playerManager expects { title, url, requestedBy }

    // If it's just a raw URL from dashboard, we might want to resolve title?
    // For now let's expect the frontend to provide a title or we use "Dashboard Request"

    // Resolve metadata if it's a URL
    // Resolve metadata if it's a URL
    let songData = {
        title: title || 'Dashboard Request',
        url: url,
        requestedBy: requestedBy || 'Dashboard User',
        duration: 0,
        thumbnail: null
    };

    // Check if input is a URL
    const isUrl = /^(http|https):\/\/[^ "]+$/.test(url);
    let queryUrl = url;

    // If not a URL, treat as search query
    if (!isUrl) {
        console.log(`[API] Input is not a URL, treating as search: ${url}`);
        queryUrl = `ytsearch1:${url}`;
    }

    // Always try to resolve metadata if it's a search OR if we need title
    if (!isUrl || (url && !title)) {
        const resolved = await resolveSongMetadata(queryUrl);
        if (resolved) {
            songData.title = resolved.title;
            songData.duration = resolved.duration;
            songData.thumbnail = resolved.thumbnail;
            songData.url = resolved.url; // IMPORTANT: Update to the actual URL
        } else {
            console.error(`[API] Failed to resolve metadata for: ${queryUrl}`);
            return res.status(400).json({ error: "Could not resolve song from query." });
        }
    }

    const song = songData;

    session.queue.push(song);

    // If idle, start playing
    if (!session.currentSong && session.queue.length === 1 && !session.connection) {
        // Auto-Join Logic
        if (req.body.requesterId && discordClient) {
            try {
                const guild = await discordClient.guilds.fetch(guildId);
                const member = await guild.members.fetch(req.body.requesterId);

                if (member.voice.channel) {
                    await session.connect(member.voice.channel);
                    session.processQueue();
                }
            } catch (err) {
                console.error("[AutoJoin] Failed to auto-connect:", err);
            }
        }
    } else if (!session.currentSong && session.connection) {
        session.processQueue();
    }

    res.json({ success: true, queueLength: session.queue.length });
});

// 4. Remove from Queue
app.delete('/api/queue/:guildId/:index', authMiddleware, (req, res) => {
    const { guildId, index } = req.params;
    const idx = parseInt(index);
    const session = getSession(guildId);

    if (idx >= 0 && idx < session.queue.length) {
        const removed = session.queue.splice(idx, 1);
        res.json({ success: true, removed: removed[0] });
    } else {
        res.status(400).json({ error: 'Invalid index' });
    }
});

// 5. Move Item in Queue
app.post('/api/queue/:guildId/move', authMiddleware, (req, res) => {
    const { guildId } = req.params;
    const { oldIndex, newIndex } = req.body;
    const session = getSession(guildId);

    if (
        oldIndex >= 0 && oldIndex < session.queue.length &&
        newIndex >= 0 && newIndex < session.queue.length
    ) {
        const [movedItem] = session.queue.splice(oldIndex, 1);
        session.queue.splice(newIndex, 0, movedItem);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid indices' });
    }
});

// 6. Get History
app.get('/api/history/:guildId', authMiddleware, async (req, res) => {
    const { guildId } = req.params;
    try {
        const history = await require('./utils/db').getHistory(guildId);
        res.json(history);
    } catch (error) {
        console.error('Failed to fetch history:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// 7. Search
app.get('/api/search', authMiddleware, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const results = await require('./utils/youtubeClient').search(q);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// 8. Controls
app.post('/api/control/:guildId/:action', authMiddleware, async (req, res) => {
    const { guildId, action } = req.params;
    const session = getSession(guildId);

    // Simple control mapping
    switch (action) {
        case 'skip':
            if (session.player) session.player.stop(); // Force skip
            break;
        case 'pause':
            session.player.pause();
            break;
        case 'resume':
            session.player.unpause();
            break;
        case 'stop':
            session.stop();
            break;
        case 'filter':
            const { filter } = req.body;
            if (session.player && filter) {
                // We need to access the bot's filter logic. 
                // Since this is a simple API, we might need to expose the filter command logic or replicate it.
                // For now, let's assume session.player has a setFilter method or similar if we refactored playerManager.
                // If not, we might need to require the filter command or move logic to playerManager.
                // Let's check playerManager...

                // actually, playerManager passes the resource. We need to recreate the resource with FFmpeg args.
                // This is complex to do purely here without the full bot context.
                // However, the `playerManager.js` export suggests we can manipulate the session.

                // Let's try to invoke the filter command logic if possible, OR
                // simpler: just set a property on the session and restart the current song?

                // Let's Assume playerManager has a method `setFilter(filterName)` or we add it.
                if (session.applyFilter) {
                    session.applyFilter(filter);
                } else {
                    return res.status(501).json({ error: 'Filter logic not implemented in playerManager' });
                }
            }
            break;
        default:
            return res.status(400).json({ error: 'Unknown action' });
    }

    res.json({ success: true, action });
});

module.exports = { initApi };
