// Configure the pinned NodeLink 3.x image from its own defaults.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.NODELINK_APP_DIR || '/app';
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(!pkg.version?.startsWith('3.')) throw new Error('This wrapper requires the pinned NodeLink 3.x image');
const original=(await import(pathToFileURL(path.join(root,'config.default.ts')).href)).default;
if(!original?.server || !original?.playback || !original?.logging) throw new Error('Unsupported NodeLink image configuration');
const positive=(name,fallback) => {
    const value=Number(process.env[name] || fallback);
    if(!Number.isInteger(value) || value<1)throw new Error('Invalid '+name);
    return value;
};
if(!process.env.NODELINK_PASSWORD) throw new Error('NODELINK_PASSWORD is required');
original.server.host='0.0.0.0';
original.server.port=2333;
original.server.password=process.env.NODELINK_PASSWORD;
original.playback.playerUpdateInterval=1000;
original.playback.statsUpdateInterval=30000;
original.playback.maxPlaylistLength=positive('NODELINK_MAX_PLAYLIST_LENGTH',10000);
// Load all metadata pages; maxPlaylistLength remains the explicit playlist cap.
original.sources.spotify.playlistLoadLimit=0;
original.sources.spotify.albumLoadLimit=0;
original.cluster.workers=positive('NODELINK_WORKERS',1);
original.logging.level=process.env.NODELINK_LOG_LEVEL || 'info';
original.logging.debug.request=false;
original.logging.file.enabled=false;
original.playback.audio.resamplingQuality=process.env.NODELINK_RESAMPLING_QUALITY || original.playback.audio.resamplingQuality;
original.sources.local.enabled=false;
// Controlled finite-duration fixtures can opt in to HTTP during the isolated soak.
original.sources.http.enabled=process.env.NODELINK_HTTP_ENABLED === 'true';
await writeFile(path.join(root,'config.js'),'export default '+JSON.stringify(original,null,2)+';\n',{mode:0o600});
const child=spawn('npm',['start'],{cwd:root,stdio:'inherit',env:{...process.env,NODELINK_SERVER_HOST:'0.0.0.0',NODELINK_SERVER_PORT:'2333',NODELINK_SERVER_PASSWORD:process.env.NODELINK_PASSWORD}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,() => child.kill(signal));
child.on('error',error => {console.error(error.message);process.exit(1);});
child.on('exit',code => process.exit(code ?? 1));
