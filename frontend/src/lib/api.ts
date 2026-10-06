import { QueueResponse,Guild,Playlist,PlaylistItem,HistoryItem,Rank } from './types';
export async function request<T>(path:string,method='GET',body?:unknown):Promise<T> {
    const response=await fetch(path,{method,credentials:'same-origin',headers:body === undefined ? {} : {'Content-Type':'application/json'},
        body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'});
    const result=await response.json().catch(() => ({error:'Server returned an invalid response'}));
    if(!response.ok) throw new Error(result.error || 'Request failed');
    return result;
}
export const fetchGuilds=() => request<{guilds:Guild[]}>('/api/guilds');
export const fetchQueue=(id:string) => request<QueueResponse>('/api/queue/'+id);
export const controlPlayer=(id:string,action:string,args:unknown={}) => request<{success:boolean;count?:number}>('/api/control/'+id+'/'+action,'POST',args);
export const fetchHistory=(id:string) => request<{history:HistoryItem[]}>('/api/history/'+id);
export const fetchRank=(id:string) => request<Rank>('/api/rank/'+id);
export const fetchLeaderboard=(id:string) => request<{leaderboard:Rank[]}>('/api/leaderboard/'+id);
export const listPlaylists=() => request<{playlists:Playlist[]}>('/api/playlists');
export const getPlaylist=(id:number) => request<Playlist>('/api/playlists/'+id);
export const createPlaylist=(name:string) => request<Playlist>('/api/playlists','POST',{name});
export const deletePlaylist=(id:number) => request('/api/playlists/'+id,'DELETE');
export const addPlaylistItem=(id:number,url:string,title:string) => request<PlaylistItem>('/api/playlists/'+id+'/items','POST',{url,title});
export const removePlaylistItem=(id:number,position:number) => request('/api/playlists/'+id+'/items/'+position,'DELETE');
