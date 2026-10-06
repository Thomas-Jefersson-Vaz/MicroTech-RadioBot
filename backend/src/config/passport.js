import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { config } from './env.js';

export function configurePassport() {
    passport.serializeUser((user,done) => done(null,{id:user.id,username:user.username,avatar:user.avatar,discriminator:user.discriminator}));
    passport.deserializeUser((user,done) => done(null,user));
    passport.use(new DiscordStrategy({
        clientID:config.discord.clientId,clientSecret:config.discord.clientSecret,
        callbackURL:process.env.CALLBACK_URL || config.frontendUrl + '/auth/discord/callback',
        scope:['identify','guilds'],state:true
    },(_accessToken,_refreshToken,profile,done) => done(null,profile)));
    return passport;
}
export default passport;
