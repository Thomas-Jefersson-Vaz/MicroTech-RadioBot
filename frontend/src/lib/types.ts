export interface Track {
    info: {
        identifier: string;
        isSeekable: boolean;
        author: string;
        length: number;
        isStream: boolean;
        position: number;
        title: string;
        uri: string;
        artworkUrl: string | null;
        isrc: string | null;
        sourceName: string;
    };
    pluginInfo: unknown;
    userData: unknown;
    requester?: {
        id: string;
        username: string;
    };
}

export interface PlayerState {
    position: number;
    duration: number;
    paused: boolean;
}

export interface QueueResponse {
    queue: Track[];
    current: Track | null;
    playerState: PlayerState | null;
}
