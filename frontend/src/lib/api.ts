import { QueueResponse } from './types';

const API_BASE = '/api'; // Proxied by Next.js

export async function fetchQueue(guildId: string): Promise<QueueResponse> {
    const res = await fetch(`${API_BASE}/queue/${guildId}`);
    if (!res.ok) {
        throw new Error('Failed to fetch queue');
    }
    return res.json();
}

export async function controlPlayer(guildId: string, action: 'skip' | 'stop' | 'pause' | 'resume') {
    const res = await fetch(`${API_BASE}/control/${guildId}/${action}`, {
        method: 'POST'
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Failed to execute command');
    }
    return res.json();
}
