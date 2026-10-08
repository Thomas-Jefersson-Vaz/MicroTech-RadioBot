import { nowPlayingReply } from '../commands/nowplaying.js';
import { Serial } from '../utils/serial.js';
import createLogger from '../utils/logger.js';

const log = createLogger('NowPlaying');
export class NowPlayingService {
    constructor(client, player, access, { schedule = setInterval, cancel = clearInterval } = {}) {
        Object.assign(this, { client, player, access, cancel });
        this.sessions = new Map();
        this.serial = new Serial();
        this.pending = new Set();
        this.closed = false;
        this.accepted = ({ guildId, channelId }) => {
            if (!channelId) return;
            const session = this.sessions.get(guildId);
            if (!session || session.ending) this.sessions.set(guildId, { channelId, card: session?.card });
            else if (!session.channelId) session.channelId = channelId;
            this.request(guildId);
        };
        this.changed = id => this.request(id);
        this.ended = id => {
            const session = this.sessions.get(id);
            if (session) session.ending = true;
            this.request(id);
        };
        player.on('sessionAccepted', this.accepted);
        player.on('change', this.changed);
        player.on('sessionEnded', this.ended);
        this.timer = schedule(() => { for (const id of this.sessions.keys()) this.request(id, true); }, 5000);
        this.timer?.unref?.();
    }
    request(id, tick = false) {
        if (this.closed || !this.sessions.has(id) || this.pending.has(id)) return;
        this.pending.add(id);
        void this.serial.run(id, async () => {
            this.pending.delete(id);
            if (!this.closed) await this.refresh(id, tick);
        }).catch(error => {
            log.warn('Card session suspended', { guildId: id, message: error.message });
            this.sessions.delete(id);
        });
    }
    async edit(card, payload) {
        try {
            // Interaction replies can be WebhookMessages: edit through the bot's channel manager.
            const channel = card.message.channel || await this.client.channels.fetch(card.message.channelId);
            await channel.messages.edit(card.message.id, payload);
            return true;
        }
        catch (error) {
            if (error.code === 10008) return false;
            throw error;
        }
    }
    async finish(session) {
        if (!session.card) return;
        await this.edit(session.card, nowPlayingReply(session.card.snapshot, { dynamic: true, ended: true }));
        session.card = null;
    }
    async refresh(id, tick = false) {
        const session = this.sessions.get(id);
        if (!session) return;
        const snapshot = await this.player.snapshot(id);
        const token = snapshot.current?.playbackToken;
        if (session.ending || (!token && !snapshot.queue.length)) {
            await this.finish(session);
            if (this.sessions.get(id) === session) this.sessions.delete(id);
            return;
        }
        if (!token || snapshot.current.terminal) {
            await this.finish(session);
            return;
        }
        if (session.deletedToken === token) return;
        if (session.card?.token !== token) {
            await this.finish(session);
            if (!session.channelId) return;
            const channel = await this.client.channels.fetch(session.channelId);
            const message = await channel.send(nowPlayingReply(snapshot, { dynamic: true }));
            session.card = { message, token, snapshot };
            return;
        }
        // Player position events can arrive frequently; only semantic changes edit immediately.
        const signature = value => JSON.stringify([value.current?.playbackToken, value.playerState?.paused,
            value.playerState?.connected, value.settings, value.queue]);
        if (tick || signature(snapshot) !== signature(session.card.snapshot)) {
            if (!await this.edit(session.card, nowPlayingReply(snapshot, { dynamic: true }))) {
                session.card = null;
                session.deletedToken = token;
            }
        }
        if (session.card) session.card.snapshot = snapshot;
    }
    async show(interaction) {
        return this.serial.run(interaction.guildId, async () => {
            const snapshot = await this.player.snapshot(interaction.guildId);
            if (!snapshot.current?.playbackToken) return interaction.editReply(nowPlayingReply(snapshot));
            let session = this.sessions.get(interaction.guildId);
            if (!session) {
                session = { channelId: null };
                this.sessions.set(interaction.guildId, session);
            }
            await this.finish(session);
            session.deletedToken = null;
            const message = await interaction.editReply(nowPlayingReply(snapshot, { dynamic: true }));
            session.card = { message, token: snapshot.current.playbackToken, snapshot };
        });
    }
    async handleButton(interaction, ready) {
        if (!interaction.customId?.startsWith('np:')) return false;
        await interaction.deferReply({ flags: 64 });
        try {
            const [, token, action] = interaction.customId.split(':');
            const session = this.sessions.get(interaction.guildId);
            if (!session || session.ending || session.card?.token !== token || session.card?.message.id !== interaction.message.id)
                throw new Error('Este card expirou. Use /nowplaying.');
            if (!ready()) throw new Error('O bot está indisponível. Tente novamente.');
            const access = await this.access.check(interaction.guildId, interaction.user.id, true);
            if (this.sessions.get(interaction.guildId) !== session || session.ending || session.card?.message.id !== interaction.message.id)
                throw new Error('Este card expirou. Use /nowplaying.');
            let result;
            if (action === 'toggle') result = await this.player.pause(interaction.guildId, 'toggle', access.channelId, token);
            else if (action === 'skip') result = await this.player.skip(interaction.guildId, token);
            else if (action === 'stop') result = await this.player.stop(interaction.guildId, token);
            else if (action === 'up' || action === 'down') result = await this.player.volume(interaction.guildId, action === 'up' ? 10 : -10, token, true);
            else throw new Error('Controle desconhecido.');
            if (result === false) throw new Error('Nenhuma reprodução ativa.');
            await this.serial.run(interaction.guildId, () => this.refresh(interaction.guildId));
            await interaction.deleteReply();
        } catch (error) {
            log.warn('Control failed', { guildId: interaction.guildId, message: error.message });
            await interaction.editReply({ content: error.status || ['Este card expirou. Use /nowplaying.', 'O bot está indisponível. Tente novamente.', 'Controle desconhecido.', 'Nenhuma reprodução ativa.'].includes(error.message) ? error.message : 'Não foi possível executar o controle.', allowedMentions: { parse: [] } });
        }
        return true;
    }
    async close() {
        this.closed = true;
        this.cancel(this.timer);
        this.player.off('sessionAccepted', this.accepted);
        this.player.off('change', this.changed);
        this.player.off('sessionEnded', this.ended);
        await Promise.allSettled([...this.sessions.keys()].map(id => this.serial.run(id, () => this.finish(this.sessions.get(id) || {}))));
        this.sessions.clear();
    }
}
