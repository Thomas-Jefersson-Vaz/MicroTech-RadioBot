import express from 'express';
import QueueService from '../services/queue.js';
import DatabaseService from '../services/database.js';

const router = express.Router();

function isAuthenticated(req, res, next) {
    // For prototype, we might skip full auth check on API if called from same-origin proxy,
    // but better to check req.isAuthenticated() if Passport is working.
    // However, API requests from Next.js Server Components might not have the cookie if not proxied correctly.
    // Next.js Rewrites sending cookies? Yes usually.
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    // Return 401
    res.status(401).json({ error: 'Unauthorized' });
}

router.get('/queue/:guildId', isAuthenticated, async (req, res) => {
    try {
        const { guildId } = req.params;
        const queue = await QueueService.getQueue(guildId);
        const { playerController } = req.services;
        const currentHook = playerController ? playerController.getCurrentTrack(guildId) : null;
        const playerState = playerController ? playerController.getPlayerState(guildId) : null;

        res.json({
            queue,
            current: currentHook,
            playerState,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch queue' });
    }
});

router.post('/control/:guildId/:action', isAuthenticated, async (req, res) => {
    const { guildId, action } = req.params;
    const { playerController } = req.services;

    if (!playerController) {
        return res.status(503).json({ error: 'Player service unavailable' });
    }

    try {
        let success = false;
        switch (action) {
            case 'skip':
                success = await playerController.skip(guildId);
                break;
            case 'stop':
                success = await playerController.stop(guildId);
                break;
            case 'pause':
                success = await playerController.pause(guildId, true);
                break;
            case 'resume':
                success = await playerController.pause(guildId, false);
                break;
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        res.json({ success });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/history/:guildId', isAuthenticated, async (req, res) => {
    try {
        const { guildId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const history = await DatabaseService.getHistory(guildId, limit);
        res.json({ history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

export default router;
