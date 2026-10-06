import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlaylistOutput} from '../src/services/ytdlp.js';
import YtdlpService from '../src/services/ytdlp.js';
test('playlist detection handles list as the first parameter and music/short URLs',()=>{
    for(const url of ['https://youtube.com/watch?list=PLtest&v=abcdefghijk','https://music.youtube.com/playlist?list=PLtest','https://youtu.be/abcdefghijk?list=PLtest'])
        assert.equal(YtdlpService.isPlaylistUrl(url),true);
    assert.equal(YtdlpService.isPlaylistUrl('search words'),false);
});
test('SoundCloud metadata is never converted into a YouTube URL',()=>{
    const result=parsePlaylistOutput(JSON.stringify({id:'12345678901',url:'https://soundcloud.com/artist/song',title:'Song',duration:120}),'https://soundcloud.com/artist/sets/mix');
    assert.equal(result.tracks[0].url,'https://soundcloud.com/artist/song');assert.equal(result.tracks[0].duration,120000);
});
test('YouTube metadata normalizes IDs and discards entries without a URL',()=>{
    const result=parsePlaylistOutput([JSON.stringify({id:'abcdefghijk',title:'Song',playlist_title:'Mix'}),JSON.stringify({title:'Missing'})].join('\n'),'https://youtube.com/playlist?list=PLtest');
    assert.equal(result.tracks.length,1);assert.equal(result.tracks[0].url,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(result.playlistName,'Mix');
});
