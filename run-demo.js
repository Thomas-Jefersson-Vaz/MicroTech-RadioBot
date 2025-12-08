const { initApi } = require('./dashboard-api');
require('dotenv').config();

// Override password for demo
process.env.DASHBOARD_PASSWORD = 'demo';

const mockClient = {
    guilds: {
        cache: [
            {
                id: '123',
                name: 'Demo Server',
                iconURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
                memberCount: 42
            }
        ]
    }
};

console.log("Starting Demo API...");
initApi(mockClient);
