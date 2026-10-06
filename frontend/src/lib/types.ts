export interface Track {
    id: string;
    encoded?: string;
    info: { identifier?:string;title:string;author?:string;length:number;uri:string;artworkUrl?:string|null;isStream?:boolean };
    requester?:{id:string;username:string};
}
export interface PlayerState { position:number;duration:number;paused:boolean;connected:boolean }
export interface QueueResponse {
    guildId:string;revision:number;queue:Track[];current:Track|null;playerState:PlayerState|null;
    playbackError:string|null;
    settings:{volume:number;filter:string};
}
export interface Guild { id:string;name:string;icon:string|null;admin:boolean;channelId:string|null }
export interface Playlist { id:number;name:string;count?:number;items?:PlaylistItem[] }
export interface PlaylistItem { id:number;url:string;title:string;duration:number;position:number }
export interface HistoryItem {title:string;url:string;requested_by:string|null;played_at:string}
export interface Rank {user_id:string;xp:number|string;level:number;rank?:number|string|null}
