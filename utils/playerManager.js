const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType
} = require('@discordjs/voice');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = process.platform === 'linux' ? 'ffmpeg' : ffmpegStatic;
const { spawn } = require('child_process');
const { addToHistory } = require('./db');
const axios = require('axios');
const youtubeClient = require('./youtubeClient');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');

// Initialize yt-dlp
const binaryPath = path.join(__dirname, '../', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const ytDlpWrap = new YTDlpWrap(binaryPath);

// Download/Update binary
(async () => {
    try {
        console.log("Checking/Updating yt-dlp binary...");
        await YTDlpWrap.downloadFromGithub(binaryPath);
        console.log("yt-dlp updated successfully.");
    } catch (err) {
        console.error("Failed to update yt-dlp:", err);
    }
})();

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

class PlayerSession {
    constructor(guildId) {
        this.guildId = guildId;
        this.queue = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.currentSong = null;
        this.volume = 100;
        this.filters = [];
        this.playbackStartTime = 0;
        this.notificationsChannel = null;
        this.timerInterval = null;

        this.player.on('stateChange', (oldState, newState) => {
            console.log(`[PlayerState] ${oldState.status} -> ${newState.status}`);
            if (oldState.status !== AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Idle) {
                console.log("[Player] Went Idle, processing queue...");
                this.processQueue();
            }
        });

        this.player.on('error', error => {
            console.error(`[${this.guildId}] Player Error:`, error.message);
            this.processQueue();
        });
    }

    async connect(channel) {
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
            this.connection.subscribe(this.player);
        } catch (error) {
            this.connection.destroy();
            throw error;
        }
    }

    async playSong(song, channel, seekTime = 0) {
        this.currentSong = song;
        const startSetup = Date.now();
        // Only add to history if starting from beginning (not seeking/reloading)
        if (seekTime === 0) {
            await addToHistory(this.guildId, song.title, song.url, song.requestedBy);
        }

        try {
            console.log(`[Player] Resolving Stream: ${song.title}`);

            // 1. Resolve Direct Stream URL & Metadata using yt-dlp --dump-json
            // This fixes the 00:00 duration issue by fetching real metadata
            const metadataJson = await ytDlpWrap.execPromise([
                song.url,
                '--dump-single-json',
                '--no-playlist'
            ]);

            const info = JSON.parse(metadataJson);

            // Extract Duration if it was missing
            if (song.duration === 0 && info.duration) {
                song.duration = info.duration;
                console.log(`[Player] Updated duration: ${song.duration}s`);
            }

            // Find best audio format URL
            // yt-dlp usually parses formats, but 'url' property in dump-json is often the requested URL
            // We need to look at 'formats' or 'requested_formats', OR just use -g separately?
            // Actually, dump-json usually has a direct 'url' if it resolved the stream, OR we iterate formats.
            // BUT simpler: let's use the --dump-json to get metadata, THEN use the 'url' property if available (for direct stream) ?
            // No, the 'url' property in the root of dump-json is often the webpage_url.
            // Let's iterate formats to find Opus/Best Audio.

            // Wait, to be safe and fast:
            // Let's assume yt-dlp -f bestaudio was the intent.
            // We can just grab the URL from the dump if we trust yt-dlp's default selection?
            // No, we didn't specify -f bestaudio in the dump command.

            // Alternative: Run the command WITH -f bestaudio?
            // yt-dlp --dump-json -f bestaudio [URL]
            // This returns the JSON for the *selected* format.

            /* RE-RUNNING with -f bestaudio causes a double request? 
               Usually yt-dlp handles this. Let's try.
            */
            /* Actually, for stability, let's keep it simple:
               We already have the metadata.
               Let's just get the stream URL via -g separately? 
               It adds latency (double request).
               
               Optimized: 
               Dump JSON contains 'formats'. We can pick the best audio one ourselves.
               Look for 'acodec' != 'none' and 'vcodec' == 'none'.
               Sort by 'abr' (audio bitrate) descending.
             */

            let streamUrl = null;
            // Try to find best audio format
            const formats = info.formats || [];
            const audioOnly = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
            const bestAudio = audioOnly.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

            if (bestAudio) {
                streamUrl = bestAudio.url;
            } else {
                // Fallback: use -g if we couldn't parse formats easily
                console.log("[Player] Fallback to -g for stream URL");
                streamUrl = await ytDlpWrap.execPromise([song.url, '-f', 'bestaudio', '-g']);
            }

            const cleanUrl = streamUrl ? streamUrl.trim() : null;
            if (!cleanUrl) throw new Error("Failed to get stream URL");

            console.log(`[Player] Stream URL OK. (Seek: ${seekTime}s)`);

            // 2. FFmpeg directly directly from the URL
            const ffmpegArgs = [
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                '-i', cleanUrl,
                '-ac', '2',
                '-ar', '48000',
                '-f', 'opus',
                'pipe:1'
            ];

            if (seekTime > 0) {
                ffmpegArgs.unshift('-ss', seekTime.toString());
            }

            if (this.filters.length > 0) {
                ffmpegArgs.splice(ffmpegArgs.indexOf('-i') + 2, 0, '-af', this.filters.join(','));
            }

            const ffmpegProcess = spawn(ffmpeg, ffmpegArgs, {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Logging - VERBOSE MODE
            if (ffmpegProcess.stderr) ffmpegProcess.stderr.on('data', d => {
                // console.log(`[ffmpeg] ${d.toString().trim()}`);
            });

            ffmpegProcess.on('close', (code, signal) => {
                console.log(`[ffmpeg] Process exited with code ${code} and signal ${signal}`);
            });

            const resourceInput = ffmpegProcess.stdout;

            // 3. Create Resource
            const resource = createAudioResource(resourceInput, {
                inlineVolume: true,
                inputType: StreamType.Arbitrary,
                metadata: {
                    title: song.title
                }
            });

            resource.volume.setVolumeLogarithmic(this.volume / 100);

            this.player.play(resource);

            // Start Realtime Console Timer
            this.playbackStartTime = Date.now() - (seekTime * 1000);
            if (this.timerInterval) clearInterval(this.timerInterval);

            // Notification
            const latency = Date.now() - startSetup;
            const formattedDuration = formatDuration(song.duration);

            if (this.notificationsChannel) {
                this.notificationsChannel.send(`🎶 Tocando agora: **${song.title}** \`[${formattedDuration}]\` | ⏱️ Latência: \`${latency}ms\``).catch(console.error);
            }

        } catch (error) {
            console.error("Error creating stream:", error);
            this.processQueue();
        }
    }

    applyFilter(filterArgs) {
        if (!this.player || this.player.state.status !== AudioPlayerStatus.Playing) return;

        // Calculate current position to resume
        const currentPosition = Math.floor((Date.now() - this.playbackStartTime) / 1000);

        console.log(`[Filter] Applying: ${filterArgs} at ${currentPosition}s`);

        // Update Filters
        if (filterArgs === 'off') {
            this.filters = [];
        } else {
            this.filters = [filterArgs];
        }

        // Restart Song at current position
        if (this.currentSong && this.notificationsChannel) {
            this.playSong(this.currentSong, this.notificationsChannel, currentPosition);
        }
    }

    async addRecommendation(lastSong) {
        if (!lastSong || !lastSong.title || !lastSong.url) return false;

        // Prevent loop: If the last song was already a recommendation, stop.
        if (lastSong.requestedBy === 'BOT_RECOMMENDATION') {
            console.log(`[${this.guildId}] Last song was a recommendation. Stopping auto-play.`);
            return false;
        }

        try {
            console.log(`[${this.guildId}] Fetching recommendation for: ${lastSong.title}`);

            // SMART QUERY LOGIC
            let query = lastSong.title;
            const parts = lastSong.title.split(/[-–|]/);
            let artist = null;
            let titleOnly = lastSong.title;

            if (parts.length >= 2) {
                artist = parts[0].trim();
                titleOnly = parts[1].trim();
                query = `${artist}`;
            } else {
                query = `${lastSong.title} similar`;
            }

            console.log(`[${this.guildId}] recommendation query: ${query}`);

            // Use YouTube Client with new Query
            const results = await youtubeClient.getRecommendations(query);

            if (!results || results.length === 0) {
                console.log(`[${this.guildId}] No recommendations found via API.`);
                return false;
            }

            // FILTERING: STRICT duplicate removal
            const filtered = results.filter(r => {
                const tResult = r.title.toLowerCase();
                const tLast = lastSong.title.toLowerCase();
                const tTitleOnly = titleOnly.toLowerCase();

                if (tResult.includes(tTitleOnly)) return false;
                if (tResult.includes(tLast)) return false;
                return true;
            });

            console.log(`[${this.guildId}] Filtered ${results.length} results down to ${filtered.length} unique options.`);

            // Take Top 5 unique-ish results
            const uniqueOptions = filtered.slice(0, 5);

            if (uniqueOptions.length === 0) {
                console.log(`[${this.guildId}] No unique recommendations found.`);
                return false;
            }

            // --- USER SELECTION STEP (BUTTONS UI) ---
            if (this.notificationsChannel) {
                // Build a nice list for the Embed body
                const description = uniqueOptions.map((rec, i) => {
                    return `**${i + 1}.** [${rec.title}](${rec.url})\nChannel: *${rec.channel}*`;
                }).join('\n\n');

                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('▶️ O que tocar a seguir?')
                    .setDescription(`Com base em **${artist || lastSong.title}**, escolha uma opção:\n\n${description}`)
                    .setFooter({ text: 'Clique no botão correspondente (30s)' });

                // Create Numbered Buttons
                const buttons = uniqueOptions.map((_, index) =>
                    new ButtonBuilder()
                        .setCustomId(`rec_${index}`)
                        .setLabel(`${index + 1}`)
                        .setStyle(ButtonStyle.Secondary)
                );

                const stopButton = new ButtonBuilder()
                    .setCustomId('stop_recommendation')
                    .setLabel('✖️ Cancelar')
                    .setStyle(ButtonStyle.Danger);

                // Organize into Rows (Discord limit 5 per row)
                const row1 = new ActionRowBuilder();
                const row2 = new ActionRowBuilder();

                buttons.forEach((btn, idx) => {
                    if (idx < 5) row1.addComponents(btn);
                    else row2.addComponents(btn);
                });

                // Add Stop button to the last non-full row or a new one
                if (row1.components.length < 5) {
                    row1.addComponents(stopButton);
                } else if (row2.components.length < 5) {
                    row2.addComponents(stopButton);
                } else {
                    // Need a 3rd row? Unlikely with 5 options max + stop
                }

                const components = [row1];
                if (row2.components.length > 0) components.push(row2);

                const message = await this.notificationsChannel.send({
                    embeds: [embed],
                    components: components
                });

                try {
                    const confirmation = await message.awaitMessageComponent({ time: 30_000 });

                    if (confirmation.customId.startsWith('rec_')) {
                        const index = parseInt(confirmation.customId.split('_')[1]);
                        const selectedTrack = uniqueOptions[index];

                        await confirmation.update({
                            content: `✅ **${selectedTrack.title}** adicionada à fila!`,
                            components: [],
                            embeds: []
                        });

                        const recSong = {
                            title: selectedTrack.title,
                            url: selectedTrack.url,
                            duration: 0,
                            requestedBy: 'BOT_RECOMMENDATION'
                        };
                        this.queue.push(recSong);
                        return true;

                    } else if (confirmation.customId === 'stop_recommendation') {
                        await confirmation.update({ content: '🛑 Parando playback.', components: [], embeds: [] });
                        return false;
                    }
                } catch (e) {
                    await message.edit({ content: '⏱️ Nenhuma escolha feita. Desconectando...', components: [], embeds: [] });
                    return false;
                }
            }

            return false;

        } catch (error) {
            console.error(`[${this.guildId}] Failed to add recommendation:`, error);
            return false;
        }
    }

    async processQueue() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        if (this.queue.length === 0) {

            // RECOMMENDATION LOGIC
            if (this.currentSong && this.connection) {
                console.log(`[DEBUG] Song finished naturally: ${this.currentSong.title}`);

                const added = await this.addRecommendation(this.currentSong);
                if (added) {
                    return this.processQueue();
                }
            }

            this.currentSong = null;

            setTimeout(() => {
                if (this.connection && this.queue.length === 0) {
                    if (this.connection) this.connection.destroy();
                    this.connection = null;
                }
            }, 1000);

            return;
        }

        const nextSong = this.queue.shift();
        this.playSong(nextSong, this.notificationsChannel);
    }

    stop() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.queue = [];
        this.player.stop();
        if (this.connection) this.connection.destroy();
        this.connection = null;
        this.currentSong = null;
    }
}

const sessions = new Map();

function getSession(guildId) {
    if (!sessions.has(guildId)) {
        sessions.set(guildId, new PlayerSession(guildId));
    }
    return sessions.get(guildId);
}

module.exports = {
    getSession,
    ytDlpWrap
};
