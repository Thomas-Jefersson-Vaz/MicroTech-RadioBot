const axios = require('axios');
require('dotenv').config();

class YouTubeClient {
    constructor() {
        this.apiKey = process.env.YOUTUBE_API_KEY;
        this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    }

    /**
     * Get recommended videos using Search API.
     * @param {string} query - The search query.
     * @returns {Promise<Array|null>} - Returns array of video objects.
     */
    async getRecommendations(query) {
        if (!this.apiKey) {
            console.error("[YouTube] Missing YOUTUBE_API_KEY.");
            return null;
        }

        try {
            console.log(`[YouTube] Fetching recommendations for query: ${query}`);

            const searchResponse = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    part: 'snippet',
                    q: `${query} mix`,
                    type: 'video',
                    maxResults: 10,
                    key: this.apiKey
                }
            });

            if (searchResponse.data.items && searchResponse.data.items.length > 0) {
                // Return mapping of top 10 results
                return searchResponse.data.items.map(item => ({
                    title: item.snippet.title,
                    id: item.id.videoId,
                    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
                    channel: item.snippet.channelTitle
                }));
            }

            console.warn("[YouTube] No videos found.");
            return null;

        } catch (error) {
            console.error(`[YouTube] Recommendation failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new YouTubeClient();
