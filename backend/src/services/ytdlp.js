import { execFile } from 'child_process';

/**
 * YtdlpService — Extracts playlist metadata using yt-dlp.
 * 
 * Uses `--flat-playlist` so only metadata (title, URL, duration) is fetched,
 * no actual downloading occurs. This is fast even for 1000+ track playlists.
 */
class YtdlpService {
    /**
     * Regex patterns that indicate a URL is a playlist (not a single track).
     * We only use yt-dlp for these — single tracks / searches go through Lavalink directly.
     */
    static PLAYLIST_PATTERNS = [
        /youtube\.com\/playlist\?list=/i,
        /youtube\.com\/watch\?.*[&?]list=/i,
        /music\.youtube\.com\/playlist\?list=/i,
        /music\.youtube\.com\/watch\?.*[&?]list=/i,
        /soundcloud\.com\/[^/]+\/sets\//i,
        /open\.spotify\.com\/playlist\//i,
        /open\.spotify\.com\/album\//i,
    ];

    /**
     * Check if a URL looks like a playlist.
     * @param {string} query 
     * @returns {boolean}
     */
    static isPlaylistUrl(query) {
        return YtdlpService.PLAYLIST_PATTERNS.some(re => re.test(query));
    }

    /**
     * Extract all track metadata from a playlist URL using yt-dlp.
     * Returns lightweight stubs suitable for queueing (no Lavalink `encoded` field).
     * 
     * @param {string} url - The playlist URL
     * @returns {Promise<{tracks: Array<{url: string, title: string, duration: number}>, playlistName: string}>}
     */
    static async extractPlaylist(url) {
        return new Promise((resolve, reject) => {
            const args = [
                '--flat-playlist',
                '--dump-json',
                '--no-warnings',
                '--no-download',
                '--ignore-errors',
                '--quiet',
                url
            ];

            console.log(`[YtDlp] Extracting playlist: ${url}`);
            const startTime = Date.now();

            // Buffer to accumulate stdout chunks
            let stdout = '';
            let stderr = '';

            const proc = execFile('yt-dlp', args, {
                maxBuffer: 100 * 1024 * 1024, // 100 MB — large playlists produce a lot of JSON
                timeout: 120_000, // 2 minute timeout
            }, (error, stdoutResult, stderrResult) => {
                stdout = stdoutResult;
                stderr = stderrResult;

                if (error && !stdout) {
                    console.error(`[YtDlp] Error: ${error.message}`);
                    if (stderr) console.error(`[YtDlp] stderr: ${stderr}`);
                    return reject(new Error(`yt-dlp failed: ${error.message}`));
                }

                // Parse JSONL output — each line is one track's metadata
                const lines = stdout.split('\n').filter(l => l.trim());
                const tracks = [];
                let playlistName = '';

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);

                        // Try to grab playlist title from the first entry
                        if (!playlistName && entry.playlist_title) {
                            playlistName = entry.playlist_title;
                        }

                        // Build a YouTube URL from the video ID
                        const videoUrl = entry.url
                            ? (entry.url.startsWith('http') ? entry.url : `https://www.youtube.com/watch?v=${entry.url}`)
                            : (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);

                        if (!videoUrl) continue;

                        tracks.push({
                            url: videoUrl,
                            title: entry.title || 'Unknown Title',
                            duration: (entry.duration || 0) * 1000, // convert seconds → ms to match Lavalink format
                            // These will be filled by the player when adding to queue:
                            // requester: { id, username }
                        });
                    } catch {
                        // Skip malformed JSON lines
                    }
                }

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(`[YtDlp] Extracted ${tracks.length} tracks from "${playlistName || url}" in ${elapsed}s`);

                resolve({ tracks, playlistName: playlistName || 'Playlist' });
            });
        });
    }
}

export default YtdlpService;
