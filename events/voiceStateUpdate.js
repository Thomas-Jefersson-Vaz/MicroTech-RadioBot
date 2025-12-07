const { Events } = require('discord.js');
const { addXp, createUser, getUser } = require('../utils/db');
const { getSession } = require('../utils/playerManager');

// Map to store join times: <guildId-userId, timestamp>
const voiceSessions = new Map();

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        // --- 1. Auto-Disconnect (Empty Channel) ---
        // If someone left a channel
        if (oldState.channelId) {
            const channel = oldState.channel;
            // Check if channel is empty (size 1 means only bot is left)
            if (channel.members.size === 1) {
                const botMember = channel.members.first();
                if (botMember.id === newState.client.user.id) {
                    console.log(`[AutoLeave] Channel ${channel.name} is empty. Disconnecting...`);
                    const session = getSession(oldState.guild.id);
                    if (session && session.connection) {
                        if (session.notificationsChannel) {
                            session.notificationsChannel.send("👋 Todo mundo saiu. Parando música e desconectando...").catch(() => { });
                        }
                        session.stop();
                    }
                }
            }
        }

        if (newState.member.user.bot) return;

        const userId = newState.member.id;
        const guildId = newState.guild.id;
        const key = `${guildId}-${userId}`;

        // CHECK: User Joined or Unmuted/Undeafened (became active)
        const isJoining = !oldState.channelId && newState.channelId;
        const isBecomingActive = (oldState.mute || oldState.deaf) && (!newState.mute && !newState.deaf);

        if ((isJoining || isBecomingActive) && (!newState.mute && !newState.deaf)) {
            voiceSessions.set(key, Date.now());
            // Ensure user exists in DB
            await createUser(guildId, userId, newState.member.user.username);
            return;
        }

        // CHECK: User Left or Muted/Deafened (became inactive)
        const isLeaving = oldState.channelId && !newState.channelId;
        const isBecomingInactive = (!oldState.mute && !oldState.deaf) && (newState.mute || newState.deaf);

        if (isLeaving || isBecomingInactive) {
            const joinTime = voiceSessions.get(key);
            if (joinTime) {
                const durationSeconds = Math.floor((Date.now() - joinTime) / 1000);
                voiceSessions.delete(key);

                if (durationSeconds > 0) {
                    // Logic: 1 XP per second
                    const xpAmount = durationSeconds;
                    console.log(`[XP] Voice: ${newState.member.user.username} earned ${xpAmount} XP for ${durationSeconds}s`);
                    await addXp(guildId, userId, xpAmount, 'voice');
                }
            }
        }
    },
};
