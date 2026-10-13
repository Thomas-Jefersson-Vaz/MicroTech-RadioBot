import { MessageFlags } from 'discord.js';
import { nowPlayingReply, nowPlayingPresentation } from '../commands/nowplaying.js';
import { Serial } from '../utils/serial.js';
import createLogger from '../utils/logger.js';

const log = createLogger('NowPlaying');
const permanent = error => [10003, 50001, 50013].includes(error.code);
const compact = snapshot => ({
    current: snapshot.current ? { playbackToken: snapshot.current.playbackToken, terminal: snapshot.current.terminal,
        info: { ...snapshot.current.info }, url: snapshot.current.url, requester: { ...snapshot.current.requester } } : null,
    playerState: snapshot.playerState ? { ...snapshot.playerState } : null,
    settings: { ...snapshot.settings }, queue: snapshot.queue?.[0] ? [{ id: snapshot.queue[0].id, info: { ...snapshot.queue[0].info } }] : [],
    queueLength: snapshot.queueLength ?? snapshot.queue?.length ?? 0
});
function sessionFor(channelId, previous) {
    return { channelId, previous, transitions: [], observedToken: null, dirty: false, tick: false };
}

export class NowPlayingService {
    constructor(client, player, access, { schedule = setInterval, cancel = clearInterval, intervalMs = 15000 } = {}) {
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('Invalid NowPlaying interval');
        Object.assign(this, { client, player, access, cancel });
        this.sessions = new Map();
        this.serial = new Serial();
        this.pending = new Set();
        this.jobs = new Map();
        this.closed = false;
        this.accepted = ({ guildId, channelId }) => {
            if (this.closed || !channelId) return;
            let session = this.sessions.get(guildId);
            if (!session || session.ending) {
                session = sessionFor(channelId, session);
                this.sessions.set(guildId, session);
            } else if (!session.channelId) session.channelId = channelId;
            session.suspended = false;
            this.request(guildId);
        };
        this.changed = (id, details) => { if (!details?.positionOnly) this.request(id); };
        this.ended = id => {
            const session = this.sessions.get(id);
            if (this.closed || !session) return;
            session.ending = true;
            this.request(id);
        };
        player.on('sessionAccepted', this.accepted);
        player.on('change', this.changed);
        player.on('sessionEnded', this.ended);
        this.timer = schedule(() => { for (const id of this.sessions.keys()) this.request(id, true); }, intervalMs);
        this.timer?.unref?.();
    }
    observe(id, session) {
        const current = this.player.getCurrentTrack?.(id);
        if (!current?.playbackToken || current.terminal || current.playbackToken === session.observedToken) return;
        session.observedToken = current.playbackToken;
        // Capture each token synchronously: coalescing must not discard intermediate songs.
        session.transitions.push(compact({ current, playerState: this.player.getPlayerState?.(id),
            settings: this.player.options?.get(id), queue: session.card?.latestSnapshot?.queue,
            queueLength: session.card?.latestSnapshot?.queueLength }));
        if (current.playbackToken !== session.failedToken) session.suspended = false;
    }
    request(id, tick = false) {
        const session = this.sessions.get(id);
        if (this.closed || !session) return Promise.resolve();
        this.observe(id, session);
        session.dirty ||= !tick;
        session.tick ||= tick;
        if (this.pending.has(id)) return this.jobs.get(id);
        if (session.suspended) return Promise.resolve();
        this.pending.add(id);
        let failed = false;
        const job = this.serial.run(id, async () => {
            // Bound each turn; remaining work rejoins the per-guild FIFO rather than monopolizing it.
            for (let pass = 0; pass < 2 && !this.closed && this.sessions.get(id) === session; pass++) {
                if (!session.dirty && !session.tick && !session.transitions.length) break;
                const periodic = session.tick;
                session.dirty = session.tick = false;
                await this.refresh(id, periodic, session);
            }
        }).catch(error => {
            failed = true;
            if (permanent(error)) session.suspended = true;
            log.warn('Panel update failed', { guildId: id, channelId: session.channelId, messageId: session.card?.message.id,
                token: session.card?.token || session.observedToken, operation: error.nowPlayingOperation || 'refresh', code: error.code, message: error.message });
        }).finally(() => {
            this.pending.delete(id);
            this.jobs.delete(id);
            const current = this.sessions.get(id);
            if (!this.closed && current && (current !== session || (!failed && (current.dirty || current.tick || current.transitions.length))))
                void this.request(id);
        });
        this.jobs.set(id, job);
        return job;
    }
    async read(id) { return compact(await this.player.snapshot(id, { queuePreview: true })); }
    async edit(card, payload) {
        try {
            const channel = card.message.channel || await this.client.channels.fetch(card.message.channelId);
            await channel.messages.edit(card.message.id, payload);
            return true;
        } catch (error) {
            if (error.code === 10008) return false;
            error.nowPlayingOperation = 'edit';
            throw error;
        }
    }
    async finish(session, sessionEnded = false) {
        const card = session.card;
        if (!card) return;
        let payload;
        const v2 = card.format === 'v2' || card.message.flags?.has(MessageFlags.IsComponentsV2);
        if (v2) {
            const view = nowPlayingPresentation(card.latestSnapshot || card.snapshot, { dynamic: true, ended: true, sessionEnded });
            if (view.visualKey === card.visualKey) { session.card = null; return; }
            payload = view.payload;
        } else {
            // Never convert historical embeds in place. Omitted fields preserve the legacy content.
            payload = { components: (card.message.components || []).map(row => {
                const data = row.toJSON ? row.toJSON() : row;
                return { ...data, components: (data.components || []).map(button => ({ ...button, disabled: true })) };
            }), allowedMentions: { parse: [] } };
        }
        if (!await this.edit(card, payload)) session.deletedToken = card.token;
        session.card = null;
    }
    active(id, owner) { return !this.closed && this.sessions.get(id) === owner; }
    logRetirement(id, session, error) {
        log.warn('Historical panel inaccessible', { guildId: id, channelId: session.channelId,
            messageId: session.card?.message.id, token: session.card?.token, operation: 'finish', code: error.code, message: error.message });
    }
    async publishTransitions(id, session, snapshot, owner = session, forceEnded = false) {
        while (session.transitions.length && this.active(id, owner)) {
            const captured = session.transitions[0];
            const token = captured.current.playbackToken;
            if (session.card?.token === token && session.card.format === 'v2') { session.transitions.shift(); continue; }
            await this.finish(session, forceEnded || session.ending);
            if (!this.active(id, owner)) return;
            if (!session.channelId || session.deletedToken === token || session.failedToken === token) { session.transitions.shift(); continue; }
            const panel = token === snapshot.current?.playbackToken ? snapshot : captured;
            try {
                session.channel ||= await this.client.channels.fetch(session.channelId);
                if (!this.active(id, owner)) return;
                const current = this.player.getCurrentTrack ? this.player.getCurrentTrack(id) : snapshot.current;
                const ended = forceEnded || session.ending || current?.playbackToken !== token || current?.terminal;
                const view = nowPlayingPresentation(panel, { dynamic: true, ended, sessionEnded: Boolean(forceEnded || session.ending) });
                const message = await session.channel.send(view.payload);
                // A send already in flight may finish after stop/close. Retain it for finalization.
                session.card = { message, token, format: 'v2', snapshot: panel, latestSnapshot: panel,
                    visualKey: view.visualKey, semanticKey: view.semanticKey };
                session.transitions.shift();
            } catch (error) {
                // An ambiguous POST failure may still have created a message. Do not automatically repost this token.
                session.failedToken = token;
                session.transitions.shift();
                session.suspended = permanent(error) || !session.transitions.length;
                error.nowPlayingOperation = 'send';
                throw error;
            }
        }
    }
    async retirePrevious(id, session, snapshot, owner = session) {
        if (!session.previous) return;
        await this.retirePrevious(id, session.previous, snapshot, owner);
        try {
            await this.publishTransitions(id, session.previous, snapshot, owner, true);
            await this.finish(session.previous, true);
        } catch (error) {
            if (!permanent(error)) throw error;
            // An inaccessible old channel must not block a new session in a different channel.
            this.logRetirement(id, session.previous, error);
        }
        session.previous = null;
    }
    async refresh(id, tick = false, session = this.sessions.get(id)) {
        if (!session || !this.active(id, session)) return;
        const snapshot = await this.read(id);
        if (!this.active(id, session)) return;
        await this.retirePrevious(id, session, snapshot);
        if (!this.active(id, session)) return;
        const token = snapshot.current?.playbackToken;
        if (token && !snapshot.current.terminal && token !== session.observedToken &&
            (!this.player.getCurrentTrack || this.player.getCurrentTrack(id)?.playbackToken === token)) {
            session.observedToken = token;
            session.transitions.push(snapshot);
        }
        await this.publishTransitions(id, session, snapshot);
        if (!this.active(id, session)) return;
        const live = this.player.getCurrentTrack?.(id);
        if (!session.ending && this.player.getCurrentTrack &&
            (live?.playbackToken !== token || Boolean(live?.terminal) !== Boolean(snapshot.current?.terminal))) {
            session.dirty = true;
            return;
        }
        if (session.ending || (!token && !snapshot.queueLength)) {
            await this.finish(session, true);
            if (this.sessions.get(id) === session) this.sessions.delete(id);
            return;
        }
        if (!token || snapshot.current.terminal) { await this.finish(session); return; }
        if (session.deletedToken === token || session.failedToken === token) return;
        // Legacy live panels are frozen first, then replaced by a fresh V2 message.
        if (session.card && session.card.format !== 'v2') {
            await this.finish(session);
            session.transitions.push(snapshot);
            session.dirty = true;
            return;
        }
        const card = session.card;
        if (!card || card.token !== token) return;
        const current = this.player.getCurrentTrack?.(id);
        if (this.player.getCurrentTrack && (current?.playbackToken !== token || current?.terminal)) return;
        card.latestSnapshot = snapshot;
        const view = nowPlayingPresentation(snapshot, { dynamic: true });
        if (view.visualKey !== card.visualKey && (tick || view.semanticKey !== card.semanticKey)) {
            if (!await this.edit(card, view.payload)) {
                session.card = null;
                session.deletedToken = token;
                return;
            }
            Object.assign(card, { snapshot, visualKey: view.visualKey, semanticKey: view.semanticKey });
        }
    }
    async show(interaction) {
        return this.serial.run(interaction.guildId, async () => {
            if (this.closed) throw new Error('NowPlaying is closed');
            let snapshot = await this.read(interaction.guildId);
            let session = this.sessions.get(interaction.guildId);
            if (session) {
                await this.retirePrevious(interaction.guildId, session, snapshot);
                await this.publishTransitions(interaction.guildId, session, snapshot);
                try { await this.finish(session); }
                catch (error) {
                    if (!permanent(error)) throw error;
                    this.logRetirement(interaction.guildId, session, error);
                    session.card = null; // The replacement message ID invalidates the inaccessible controls.
                }
                snapshot = await this.read(interaction.guildId);
            }
            if (this.closed) throw new Error('NowPlaying is closed');
            if (session && this.sessions.get(interaction.guildId) !== session)
                throw Object.assign(new Error('Playback changed. Use /nowplaying.'), { status: 409 });
            if (!snapshot.current?.playbackToken || snapshot.current.terminal || session?.ending) {
                const result = await interaction.editReply(nowPlayingReply({ ...snapshot, current: null }));
                interaction.nowPlayingV2 = true;
                return result;
            }
            if (!session) { session = sessionFor(null); this.sessions.set(interaction.guildId, session); }
            session.deletedToken = null;
            session.failedToken = null;
            session.suspended = false;
            session.observedToken = snapshot.current.playbackToken;
            const view = nowPlayingPresentation(snapshot, { dynamic: true });
            try {
                const message = await interaction.editReply(view.payload);
                interaction.nowPlayingV2 = true;
                session.card = { message, token: snapshot.current.playbackToken, format: 'v2', snapshot, latestSnapshot: snapshot,
                    visualKey: view.visualKey, semanticKey: view.semanticKey };
                this.request(interaction.guildId);
                return message;
            } catch (error) { session.failedToken = snapshot.current.playbackToken; throw error; }
        });
    }
    async executeButton(interaction, ready) {
        const [, token, action] = interaction.customId.split(':');
        const session = this.sessions.get(interaction.guildId);
        if (this.closed || !session || session.suspended || session.ending || session.card?.token !== token || session.card?.message.id !== interaction.message.id)
            throw new Error('Este card expirou. Use /nowplaying.');
        if (!ready()) throw new Error('O bot está indisponível. Tente novamente.');
        const access = await this.access.check(interaction.guildId, interaction.user.id, true);
        if (this.closed || this.sessions.get(interaction.guildId) !== session || session.suspended || session.ending || session.card?.token !== token || session.card?.message.id !== interaction.message.id)
            throw new Error('Este card expirou. Use /nowplaying.');
        let result;
        if (action === 'toggle') result = await this.player.pause(interaction.guildId, 'toggle', access.channelId, token);
        else if (action === 'skip') result = await this.player.skip(interaction.guildId, token);
        else if (action === 'stop') result = await this.player.stop(interaction.guildId, token);
        else if (action === 'up' || action === 'down') result = await this.player.volume(interaction.guildId, action === 'up' ? 10 : -10, token, true);
        else throw new Error('Controle desconhecido.');
        if (result === false) throw new Error('Nenhuma reprodução ativa.');
        await this.request(interaction.guildId);
        await interaction.deleteReply();
    }
    async handleButton(interaction, ready) {
        if (!interaction.customId?.startsWith('np:')) return false;
        await interaction.deferReply({ flags: 64 });
        try {
            await this.executeButton(interaction, ready);
        } catch (error) {
            log.warn('Control failed', { guildId: interaction.guildId, message: error.message });
            await interaction.editReply({ content: error.status || ['Este card expirou. Use /nowplaying.', 'O bot está indisponível. Tente novamente.', 'Controle desconhecido.', 'Nenhuma reprodução ativa.'].includes(error.message) ? error.message : 'Não foi possível executar o controle.', allowedMentions: { parse: [] } });
        }
        return true;
    }
    async close() {
        if (this.closing) return this.closing;
        this.closed = true;
        this.cancel(this.timer);
        this.player.off('sessionAccepted', this.accepted);
        this.player.off('change', this.changed);
        this.player.off('sessionEnded', this.ended);
        const finishAll = async (id, session) => {
            if (!session) return;
            if (session.previous) await finishAll(id, session.previous);
            try { await this.finish(session, true); }
            catch (error) { this.logRetirement(id, session, error); }
        };
        this.closing = Promise.allSettled([...this.sessions.keys()].map(id => this.serial.run(id, async () => {
            await finishAll(id, this.sessions.get(id));
        }))).then(() => { this.sessions.clear(); this.pending.clear(); this.jobs.clear(); });
        return this.closing;
    }
}
