'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import * as api from '@/lib/api';
import {Guild,QueueResponse,Playlist,HistoryItem,Rank} from '@/lib/types';
import {useAuth} from '@/lib/auth';

const duration=(milliseconds:number) => {
    const total=Math.max(0,Math.floor(milliseconds/1000));
    return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
};
const message=(error:unknown) => error instanceof Error ? error.message : 'Request failed';

export default function Home() {
    const auth=useAuth();
    const [guilds,setGuilds]=useState<Guild[]>([]);
    const [guildId,setGuildId]=useState('');
    const [snapshot,setSnapshot]=useState<QueueResponse|null>(null);
    const [connected,setConnected]=useState(false);
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState<string|null>(null);
    const [notice,setNotice]=useState('');
    const [query,setQuery]=useState('');
    const [volume,setVolume]=useState(100);
    const [history,setHistory]=useState<HistoryItem[]>([]);
    const [rank,setRank]=useState<Rank|null>(null);
    const [leaders,setLeaders]=useState<Rank[]>([]);
    const [playlists,setPlaylists]=useState<Playlist[]>([]);
    const [playlist,setPlaylist]=useState<Playlist|null>(null);
    const [playlistName,setPlaylistName]=useState('');
    const [trackUrl,setTrackUrl]=useState('');
    const [trackTitle,setTrackTitle]=useState('');
    const [position,setPosition]=useState(0);
    const anchor=useRef<{snapshot:QueueResponse;received:number}|null>(null);
    const dragged=useRef<string|null>(null);
    const activeGuild=guilds.find(guild => guild.id === guildId);
    const disabled=busy || !connected;
    const refreshPlaylists=useCallback(async () => {
        const data=await api.listPlaylists();setPlaylists(data.playlists);
    },[]);
    const run=async (operation:()=>Promise<unknown>,success='Saved') => {
        setBusy(true);setError(null);setNotice('');
        try {await operation();setNotice(success);}
        catch(error) {setError(message(error));}
        finally {setBusy(false);}
    };
    const act=(action:string,args:unknown={}) => run(() => api.controlPlayer(guildId,action,args),'Completed: '+action);

    useEffect(() => {
        if(!auth.user) return;
        let cancelled=false;
        api.fetchGuilds().then(data => {
            if(cancelled) return;
            setGuilds(data.guilds);
            const saved=localStorage.getItem('mikrotech.guild');
            setGuildId(data.guilds.some(g => g.id === saved) ? saved! : data.guilds[0]?.id || '');
        }).catch(error => {if(!cancelled)setError(message(error));});
        api.listPlaylists().then(data => {if(!cancelled)setPlaylists(data.playlists);}).catch(error => {if(!cancelled)setError(message(error));});
        return () => {cancelled=true;};
    },[auth.user,refreshPlaylists]);

    useEffect(() => {
        if(!auth.user || !guildId) return;
        let cancelled=false;
        let socket:WebSocket|undefined;
        let retry:ReturnType<typeof setTimeout>|undefined;
        let revision=-1;
        const receive=(data:QueueResponse) => {
            if(cancelled || data.guildId !== guildId || data.revision < revision) return;
            revision=data.revision;
            setSnapshot(data);
            if(anchor.current?.snapshot.settings.volume !== data.settings.volume)setVolume(data.settings.volume);
            anchor.current={snapshot:data,received:Date.now()};
        };
        const connect=() => {
            if(cancelled) return;
            revision=-1;
            let received=false;
            socket=new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://')+location.host+'/api/live?guildId='+guildId);
            socket.onmessage=event => {
                if(cancelled) return;
                try {receive(JSON.parse(event.data));setConnected(true);if(!received)setError(null);received=true;}
                catch {setError('Invalid live update');socket?.close();}
            };
            socket.onclose=() => {if(cancelled)return;setConnected(false);retry=setTimeout(connect,3000);};
            socket.onerror=() => socket?.close();
        };
        localStorage.setItem('mikrotech.guild',guildId);
        api.fetchQueue(guildId).then(receive).catch(error => {if(!cancelled)setError(message(error));});
        connect();
        const refresh=() => {
            Promise.all([api.fetchHistory(guildId),api.fetchRank(guildId),api.fetchLeaderboard(guildId)]).then(([h,r,l]) => {
                if(!cancelled){setHistory(h.history);setRank(r);setLeaders(l.leaderboard);}
            }).catch(error => {if(!cancelled)setError(message(error));});
        };
        refresh();
        const interval=setInterval(refresh,15000);
        return () => {cancelled=true;clearTimeout(retry);clearInterval(interval);socket?.close();anchor.current=null;};
    },[guildId,auth.user]);

    useEffect(() => {
        const timer=setInterval(() => {
            const current=anchor.current;
            if(!current?.snapshot.playerState) {setPosition(0);return;}
            const state=current.snapshot.playerState;
            const speed=current.snapshot.settings.filter === 'nightcore' ? 1.2 : current.snapshot.settings.filter === 'vaporwave' ? 0.85 : 1;
            const elapsed=state.paused || !state.connected || !connected ? 0 : (Date.now()-current.received)*speed;
            setPosition(Math.min(state.position+elapsed,state.duration || Infinity));
        },250);
        return () => clearInterval(timer);
    },[connected]);
    const selectGuild=(id:string) => {
        setConnected(false);setSnapshot(null);setHistory([]);setRank(null);setLeaders([]);setGuildId(id);anchor.current=null;setError(null);
    };
    const selectPlaylist=async (id:number) => setPlaylist(await api.getPlaylist(id));
    const track=snapshot?.current;
    const state=snapshot?.playerState;

    return <div className="shell">
        <header><div><p className="eyebrow">YOUR SERVER. YOUR SOUND.</p><h1>MikroTech Radio</h1></div>
            {auth.user ? <div className="account"><span>{auth.user.username}</span><button onClick={() => run(auth.logout,'Logged out')}>Log out</button></div>
                : <button disabled={auth.loading} onClick={auth.login}>Login with Discord</button>}
        </header>
        {(error || auth.error) && <p role="alert" className="alert">{error || auth.error}</p>}
        {notice && <p role="status" className="notice">{notice}</p>}
        {auth.user && snapshot?.playbackError && <p role="alert" className="alert">{snapshot.playbackError}</p>}
        {!auth.user ? <section className="panel"><h2>Music for your community</h2><p>Sign in to select a server, manage its queue, and see what is playing.</p></section> : <>
            <div className="toolbar"><label>Server <select aria-label="Server" value={guildId} onChange={event => selectGuild(event.target.value)}>
                {guilds.map(guild => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
            </select></label><span className={connected ? 'online' : 'offline'} role="status">{connected ? 'Live' : 'Connecting — controls paused'}</span></div>
            {!guildId ? <section className="panel">No shared servers found. Invite the bot to your server, then sign in again.</section> : <>
                <section className="now-playing panel">
                    <div className="art">{/* Remote provider artwork varies; a regular image avoids a hostname allowlist. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {track?.info.artworkUrl ? <img src={track.info.artworkUrl} alt="Current track artwork"/> : <span>♫</span>}
                    </div>
                    <div className="track"><p className="eyebrow">NOW PLAYING</p><h2>{track?.info.title || 'Ready for your next song'}</h2><p>{track?.info.author || 'Add music below'}</p>
                        <progress max={state?.duration || 1} value={Math.min(position,state?.duration || 0)} aria-label="Playback progress"/>
                        <div className="times"><span>{duration(position)}</span><span>{state?.paused ? 'Paused · ' : ''}{track?.info.isStream ? 'Live stream' : duration(state?.duration || 0)}</span></div>
                    </div>
                </section>
                <section className="panel"><form onSubmit={event => {event.preventDefault();void act('play',{query});}} className="search">
                    <label className="grow">Add music<input required value={query} onChange={event => setQuery(event.target.value)} placeholder="Song, URL, or playlist · use && for multiple" maxLength={2000}/></label>
                    <button disabled={disabled}>Add to queue</button>
                </form><p className="muted">Join the bot’s voice channel to control music. Server administrators can override.</p>
                    <div className="controls">
                        <button disabled={disabled} onClick={() => act(state?.paused ? 'resume' : track ? 'pause' : 'resume')}>{state?.paused || !track ? 'Resume' : 'Pause'}</button>
                        <button disabled={disabled} onClick={() => act('skip')}>Skip</button><button disabled={disabled} onClick={() => act('stop')}>Stop & leave</button>
                        <label>Volume <input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))}/><span>{volume}%</span></label>
                        <button disabled={disabled} onClick={() => act('volume',{value:volume})}>Apply volume</button>
                        <label>Filter <select aria-label="Filter" disabled={disabled} value={snapshot?.settings.filter || 'reset'} onChange={event => act('filter',{preset:event.target.value})}>
                            {['reset','bassboost','nightcore','vaporwave'].map(filter => <option key={filter}>{filter}</option>)}
                        </select></label>
                    </div>
                </section>
                <section className="panel"><div className="section-title"><h2>Up next <span className="badge">{snapshot?.queue.length || 0}</span></h2><div><button disabled={disabled} onClick={() => act('shuffle')}>Shuffle</button> <button disabled={disabled} onClick={() => act('clear')}>Clear queue</button></div></div>
                    <p className="muted">Drag tracks to reorder. Jump starts a track and removes the entries before it.</p>
                    {!snapshot?.queue.length && <p className="empty">Your queue is empty.</p>}
                    <ol className="queue">{snapshot?.queue.map((entry,index) => <li key={entry.id || index} draggable={!disabled}
                        onDragStart={() => {dragged.current=entry.id;}}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => {
                            event.preventDefault();
                            const from=snapshot.queue.findIndex(item => item.id === dragged.current)+1;
                            dragged.current=null;
                            if(from && from !== index+1) void act('move',{from,to:index+1});
                        }}>
                        <span className="number">{index+1}</span><div className="grow"><strong>{entry.info.title}</strong><small>{entry.info.author || 'Unknown artist'} · {duration(entry.info.length)} · {entry.requester?.username || 'Unknown requester'}</small></div>
                        <button disabled={disabled} aria-label={'Jump to '+entry.info.title} onClick={() => act('jump',{position:index+1})}>Jump</button>
                    </li>)}</ol>
                </section>
                <div className="columns"><section className="panel"><h2>Your playlists</h2>
                    <form onSubmit={event => {event.preventDefault();void run(async () => {await api.createPlaylist(playlistName);setPlaylistName('');await refreshPlaylists();});}}>
                        <label>Name<input required maxLength={100} value={playlistName} onChange={event => setPlaylistName(event.target.value)}/></label><button disabled={busy}>Create</button>
                    </form>
                    <div className="playlist-list">{playlists.map(item => <button key={item.id} disabled={busy} onClick={() => run(() => selectPlaylist(item.id),'Playlist opened')}>{item.name} ({item.count || 0})</button>)}</div>
                    {playlist && <div><div className="section-title"><h3>{playlist.name}</h3><button disabled={busy} onClick={() => run(async () => {await api.deletePlaylist(playlist.id);setPlaylist(null);await refreshPlaylists();},'Playlist deleted')}>Delete</button></div>
                        <button disabled={disabled} onClick={() => act('playlist-load',{id:playlist.id})}>Load into queue</button>
                        <ol className="playlist-items">{playlist.items?.map(item => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><button disabled={busy} onClick={() => run(async () => {await api.removePlaylistItem(playlist.id,item.position);await selectPlaylist(playlist.id);await refreshPlaylists();},'Track removed')}>Remove</button></li>)}</ol>
                        <form onSubmit={event => {event.preventDefault();void run(async () => {await api.addPlaylistItem(playlist.id,trackUrl,trackTitle);setTrackUrl('');setTrackTitle('');await selectPlaylist(playlist.id);await refreshPlaylists();},'Track added');}}>
                            <label>Track URL<input required type="url" value={trackUrl} onChange={event => setTrackUrl(event.target.value)}/></label>
                            <label>Title<input value={trackTitle} onChange={event => setTrackTitle(event.target.value)} maxLength={300}/></label><button disabled={busy}>Save track</button>
                        </form>
                    </div>}
                </section><section className="panel"><h2>Recently played</h2><ul className="history">{history.map((item,index) => <li key={item.played_at+index}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><small>{new Date(item.played_at).toLocaleString()}</small></li>)}</ul>{!history.length && <p className="muted">No playback history yet.</p>}</section></div>
                <div className="columns"><section className="panel"><h2>Server leaderboard</h2><p>Your level: {rank?.level || 0} · {rank?.xp || 0} XP · rank {rank?.rank || 'unranked'}</p>
                    <ol className="history">{leaders.map(member => <li key={member.user_id}><strong>{member.user_id}</strong><small>Level {member.level} · {member.xp} XP</small></li>)}</ol>
                </section><section className="panel"><h2>AI & settings</h2><p>Mention the bot in Discord to chat or request music actions. Your current voice-channel permissions apply.</p>
                    <button disabled={busy} onClick={() => run(() => api.request('/api/memory/'+guildId+'/clear','POST'),'AI memory cleared')}>Clear my AI memory</button>
                    {activeGuild?.admin && <form onSubmit={event => {event.preventDefault();void run(() => api.request('/api/settings/'+guildId,'POST',{volume}),'Default server volume saved');}}>
                        <p>Administrator settings</p><label>Default volume<input type="number" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))}/></label><button disabled={busy}>Save default volume</button>
                    </form>}
                </section></div>
            </>}
        </>}
        <footer>MikroTech Radio · Discord commands and dashboard share the same player.</footer>
    </div>;
}
