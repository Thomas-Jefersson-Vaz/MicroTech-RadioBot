import express from 'express';
import passport from 'passport';

const router = express.Router();

// GET /auth/discord
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Discord authentication will involve redirecting
//   the user to discord.com.  After authorization, Discord will redirect the user
//   back to this application at /auth/discord/callback
router.get('/discord', passport.authenticate('discord'));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// GET /auth/discord/callback
router.get('/discord/callback', passport.authenticate('discord', {
    failureRedirect: FRONTEND_URL
}), function (req, res) {
    res.redirect(FRONTEND_URL);
});

router.get('/logout', function (req, res, next) {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

router.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ authenticated: true, user: req.user });
    } else {
        res.json({ authenticated: false });
    }
});

export default router;
