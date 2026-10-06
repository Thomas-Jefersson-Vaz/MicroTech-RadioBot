import { PermissionFlagsBits } from 'discord.js';
import { fail } from '../utils/validation.js';

export class AccessService {
    constructor(client) { this.client = client; }
    async member(guildId,userId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) fail('The bot is not in this server',404);
        try { return await guild.members.fetch({ user:userId,force:true }); }
        catch { fail('You are not a member of this server',403); }
    }
    async check(guildId,userId,control = false,adminOnly = false) {
        const member = await this.member(guildId,userId);
        const admin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (adminOnly && !admin) fail('Administrator permission required',403);
        const botChannel = member.guild.members.me?.voice.channelId;
        const channelId = member.voice.channelId;
        if (control && (!admin || !botChannel) && (!channelId || (botChannel && channelId !== botChannel)))
            fail('Join the bot’s voice channel to control playback',403);
        return { member, channelId: channelId || botChannel, admin };
    }
    async guilds(userId) {
        const result = [];
        // Query current membership rather than trusting OAuth guilds saved in an old session.
        for (const guild of this.client.guilds.cache.values()) {
            try {
                const access = await this.check(guild.id,userId);
                result.push({ id:guild.id,name:guild.name,icon:guild.iconURL(),admin:access.admin,channelId:access.channelId });
            } catch(error) { if (error.status !== 403) throw error; }
        }
        return result;
    }
}
