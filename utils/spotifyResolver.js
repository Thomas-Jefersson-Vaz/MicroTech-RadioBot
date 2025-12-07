const axios = require('axios');
const cheerio = require('cheerio');

async function resolveSpotifyTrack(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);

        const ogTitle = $('meta[property="og:title"]').attr('content');
        const ogDesc = $('meta[property="og:description"]').attr('content');

        if (!ogTitle) return null;

        let artist = "";
        let song = ogTitle;

        if (ogDesc) {
            // Common format: "Artist · Song · Year" or "Artist, Artist2 · Song · Year"
            const parts = ogDesc.split(' · ');
            if (parts.length >= 1) {
                artist = parts[0];
            }
        }

        return `${artist} - ${song}`;
    } catch (error) {
        console.error("Error in resolveSpotifyTrack:", error.message);
        return null;
    }
}

module.exports = { resolveSpotifyTrack };
