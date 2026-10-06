import express from 'express';
import passport from 'passport';
import { config } from '../config/env.js';
const router = express.Router();
router.get('/discord',passport.authenticate('discord'));
router.get('/discord/callback',passport.authenticate('discord',{failureRedirect:config.frontendUrl + '/?login=failed'}),(_req,res) => res.redirect(config.frontendUrl));
router.post('/logout',(req,res,next) => req.logout(error => {
    if(error) return next(error);
    req.session.destroy(error => { if(error) return next(error); res.clearCookie('mikrotech.sid'); res.json({success:true}); });
}));
router.get('/user',(req,res) => res.json(req.isAuthenticated() ? {authenticated:true,user:req.user} : {authenticated:false}));
export default router;
