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
            // 1. Resolve Direct Stream URL using yt-dlp
            const streamUrl = await ytDlpWrap.execPromise([
                song.url,
                '-f', 'bestaudio',
                '-g'
            ]);

            const cleanUrl = streamUrl.trim();
            if (!cleanUrl) throw new Error("Failed to get stream URL");

            console.log(`[Player] Resolved Stream URL: ${cleanUrl.substring(0, 50)}... (Seek: ${seekTime}s)`);

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

            // SEEKING LOGIC: Add -ss before -i (faster seeking) or after (accurate)? 
            // For live streams/direct URL, input seeking (-ss before -i) is usually best.
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
            // Timer removed as requested
            /*
            this.timerInterval = setInterval(() => {
                if (this.player.state.status === AudioPlayerStatus.Playing) {
                    const elapsed = Math.floor((Date.now() - this.playbackStartTime) / 1000);
                    console.log(`[Timer] Playing: ${formatDuration(elapsed)}`);
                }
            }, 1000);
            */

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

    processQueue() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        if (this.queue.length === 0) {
            this.currentSong = null;
            if (this.notificationsChannel) {
                this.notificationsChannel.send("⏹️ Fila terminada. Saindo do canal...").catch(() => { });
            }

            // Disconnect after 5 seconds to allow message to be read/seen
            setTimeout(() => {
                if (this.connection && this.queue.length === 0) { // Check queue again just in case
                    this.connection.destroy();
                    this.connection = null;
                }
            }, 5000);

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
