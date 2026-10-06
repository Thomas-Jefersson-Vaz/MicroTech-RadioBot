import {execFile} from 'node:child_process';
import createLogger from '../utils/logger.js';
const log=createLogger('YtDlp');
export function parsePlaylistOutput(output,playlistUrl) {
    const youtube=/(^|\.)youtube\.com$|^youtu\.be$/.test(new URL(playlistUrl).hostname);
    const tracks=[];
    let playlistName='Playlist';
    for(const line of output.split('\n').filter(line=>line.trim())) {
        let entry;
        try {entry=JSON.parse(line);} catch {log.warn('Malformed playlist metadata skipped');continue;}
        if(entry.playlist_title)playlistName=entry.playlist_title;
        let url=entry.webpage_url || entry.url;
        if(youtube && /^[\w-]{11}$/.test(entry.id || ''))url='https://www.youtube.com/watch?v='+entry.id;
        else if(youtube && /^[\w-]{11}$/.test(url || ''))url='https://www.youtube.com/watch?v='+url;
        if(!/^https?:\/\//i.test(url || ''))continue;
        const parsed=new URL(url);
        if(parsed.hostname === 'music.youtube.com')parsed.hostname='www.youtube.com';
        parsed.searchParams.delete('si');
        tracks.push({url:parsed.toString(),title:entry.title || 'Unknown title',author:entry.uploader || entry.channel || 'Unknown',duration:Math.max(0,Number(entry.duration) || 0)*1000});
    }
    return {tracks,playlistName};
}
export default class YtdlpService {
    static isPlaylistUrl(query) {
        try {
            const url=new URL(query.replace(/^url:/,''));
            if(/(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname))return url.searchParams.has('list');
            if(url.hostname === 'soundcloud.com')return /\/sets\//.test(url.pathname);
            if(url.hostname === 'open.spotify.com')return /^\/(playlist|album)\//.test(url.pathname);
            return false;
        } catch {return false;}
    }
    static async extractPlaylist(url) {
        return new Promise((resolve,reject) => {
            execFile('yt-dlp',['--flat-playlist','--dump-json','--no-warnings','--skip-download','--ignore-errors','--quiet','--',url],
                {maxBuffer:100*1024*1024,timeout:120000},(error,stdout) => {
                    if(error)return reject(new Error('Playlist extraction failed or timed out'));
                    try {
                        const result=parsePlaylistOutput(stdout,url);
                        if(!result.tracks.length)return reject(new Error('No usable playlist tracks'));
                        log.info('Playlist extracted',{name:result.playlistName,count:result.tracks.length});
                        resolve(result);
                    } catch(error) {reject(error);}
                });
        });
    }
}
