import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import PlayerController from '../src/services/player.js';
import { ActionService } from '../src/services/actions.js';
const track=(id,encoded=id) => ({id,encoded,info:{title:id,uri:'https://www.youtube.com/watch?v='+id,length:100000,author:'Artist'},requester:{id:'user',username:'User'}});
function fixture(entries=[],resolver=async q=>({loadType:'track',data:track(q,'resolved:'+q)})) {
    let queue=structuredClone(entries);
    const plays=[];
    const history=[];
    const node={rest:{resolve:resolver}};
    const player=new EventEmitter();
    Object.assign(player,{
        playTrack:async options => {plays.push(options);player.track=options.track.encoded;player.paused=options.paused || false;},
        stopTrack:async () => {},
        setPaused:async paused => {player.paused=paused;},
        setGlobalVolume:async value => {player.volume=value;},
        clearFilters:async () => {},
        setFilters:async filters => {player.filters=filters;},
        update:async (options,noReplace=false) => {
            if(!noReplace)player.paused=false;
            if(options.paused !== undefined)player.paused=options.paused;
            if(options.volume !== undefined)player.volume=options.volume;
            if(options.filters)player.filters={...player.filters,...options.filters};
        }
    });
    const database={recordHistory:async (...args)=>history.push(args),getGuildSettings:async()=>null,upsertGuildSettings:async()=>{}};
    const storage={
        peek:async()=>structuredClone(queue[0] || null),
        next:async (_id,expected)=> {
            if(!queue.length || (expected && expected.id !== queue[0].id))return null;
            return queue.shift();
        },
        getQueue:async()=>structuredClone(queue),
        add:async (_id,tracks)=> {queue.push(...tracks.map((t,i)=>({...t,id:'added-'+i})));},
        clear:async()=>{queue=[];},
        edit:async (_id,action,from,to)=> {
            if(action === 'shuffle')queue.reverse();
            if(action === 'move'){const item=queue.splice(from-1,1)[0];queue.splice(to-1,0,item);}
            if(action === 'jump')queue.splice(0,from-1);
        },
        client:{lPush:async (_key,value)=>queue.unshift(JSON.parse(value))}
    };
    const shoukaku={players:new Map([['guild',player]]),nodes:new Map([['node',node]]),options:{nodeResolver:nodes=>nodes.get('node')},
        leaveVoiceChannel:async()=>{shoukaku.players.delete('guild');player.removeAllListeners();},joinVoiceChannel:async()=>{shoukaku.players.set('guild',player);return player;}};
    const controller=new PlayerController({guilds:{cache:new Map()}},{shoukaku},{queue:storage,database,extractor:{isPlaylistUrl:()=>false},timeout:100});
    controller.setupPlayerEvents(player,'guild');
    const event=(current,reason='finished')=>({reason,track:{encoded:current.encoded,userData:{playbackToken:current.playbackToken}}});
    const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));await controller.serial.pending.get('guild');await new Promise(resolve=>setImmediate(resolve));};
    return {controller,player,shoukaku,plays,history,storage,event,flush,node,get queue(){return queue;}};
}
test('card controls reject old tokens inside the lock, including identical consecutive songs',async()=>{
    const f=fixture([track('a','same'),track('b','same'),track('c')]);
    await f.controller.playNext('guild');
    const token=f.controller.getCurrentTrack('guild').playbackToken;
    const results=await Promise.allSettled([f.controller.skip('guild',token),f.controller.skip('guild',token)]);
    assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');
    assert.equal(f.controller.getCurrentTrack('guild').id,'b');
    const generation=f.controller.generation('guild');
    await assert.rejects(f.controller.stop('guild',token),{status:409});
    await assert.rejects(f.controller.pause('guild','toggle',undefined,token),{status:409});
    await assert.rejects(f.controller.volume('guild',10,token,true),{status:409});
    assert.equal(f.controller.generation('guild'),generation);assert.equal(f.queue.length,1);
});
test('card toggles and relative volume are computed inside serialized control operations',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');
    const token=f.controller.getCurrentTrack('guild').playbackToken;
    await Promise.all([f.controller.pause('guild','toggle',undefined,token),f.controller.pause('guild','toggle',undefined,token)]);
    assert.equal(f.controller.getPlayerState('guild').paused,false);
    await f.controller.volume('guild',95);
    await f.controller.volume('guild',10,token,true);assert.equal(f.player.volume,100);
    await Promise.all([f.controller.volume('guild',-10,token,true),f.controller.volume('guild',-10,token,true)]);
    assert.equal(f.player.volume,80);
    await f.controller.volume('guild',0);await f.controller.volume('guild',-10,token,true);assert.equal(f.player.volume,0);
});

test('simultaneous command toggles return each applied state inside the player lock',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');
    const actions=new ActionService(f.controller,{}, {check:async()=>({channelId:'voice'})});
    const results=await Promise.all([actions.execute('guild',{id:'user'},'pause',{toggle:true}),actions.execute('guild',{id:'user'},'pause',{toggle:true})]);
    assert.deepEqual(results,[{success:true,paused:true},{success:true,paused:false}]);
    assert.equal(f.controller.getPlayerState('guild').paused,false);
});
test('accepted playback exposes source channel only after enqueuing tracks',async()=>{
    const f=fixture();const accepted=[];
    f.controller.on('sessionAccepted',event=>accepted.push(event));
    await f.controller.enqueue('guild','voice',{id:'u',username:'U'},'song','origin');
    assert.deepEqual(accepted,[{guildId:'guild',channelId:'origin'}]);
    await f.controller.enqueueTracks('guild','voice',{id:'u'},[track('other')],'playlist-origin');
    assert.equal(accepted[1].channelId,'playlist-origin');
});
test('natural end advances once when stuck/end arrive together',async()=>{
    const f=fixture([track('a'),track('b'),track('c')]);
    await f.controller.playNext('guild');
    const old=f.controller.getCurrentTrack('guild');
    f.player.emit('end',f.event(old));f.player.emit('stuck',f.event(old));f.player.emit('end',f.event(old));
    await f.flush();
    assert.equal(f.plays.length,2);assert.equal(f.controller.getCurrentTrack('guild').id,'b');assert.equal(f.queue.length,1);
});
test('a delayed old event cannot end a consecutive copy of the same song',async()=>{
    const f=fixture([track('a','same'),track('b','same'),track('c')]);
    await f.controller.playNext('guild');const old=f.controller.getCurrentTrack('guild');
    await f.controller.skip('guild');f.player.emit('end',f.event(old));await f.flush();
    assert.equal(f.controller.getCurrentTrack('guild').id,'b');assert.equal(f.plays.length,2);
});
test('stop during resolution cancels pending playback and clears the queue',async()=>{
    let release;const resolving=new Promise(resolve=>{release=resolve;});
    const f=fixture([{...track('a'),encoded:undefined}],()=>resolving);
    const advance=f.controller.playNext('guild');await new Promise(resolve=>setImmediate(resolve));
    const stop=f.controller.stop('guild');release({loadType:'track',data:track('resolved')});
    await Promise.all([advance,stop]);
    assert.equal(f.plays.length,0);assert.equal(f.queue.length,0);assert.equal(f.controller.getCurrentTrack('guild'),null);
});
test('prefetch is matched by entry ID after shuffle',async()=>{
    const f=fixture([track('a'),track('b')]);await f.controller.prefetchNext('guild');
    await f.controller.editQueue('guild','shuffle');await f.controller.playNext('guild');
    assert.equal(f.plays[0].track.encoded,'b');assert.equal(f.queue[0].id,'a');
});
test('stale prefetch cannot consume a cleared entry',async()=>{
    const f=fixture([track('a')]);await f.controller.prefetchNext('guild');
    await f.controller.editQueue('guild','clear');await f.controller.playNext('guild');assert.equal(f.plays.length,0);
});
test('missing node preserves the next entry',async()=>{
    const f=fixture([track('a')]);f.shoukaku.nodes.clear();await f.controller.playNext('guild');assert.equal(f.queue.length,1);assert.equal(f.plays.length,0);
});
test('transport errors preserve entry for resume',async()=>{
    const f=fixture([{...track('a'),encoded:undefined}],async()=>{throw new Error('network');});
    await f.controller.playNext('guild');assert.equal(f.queue.length,1);assert.equal(f.plays.length,0);
});
test('play request failure puts the consumed entry back',async()=>{
    const f=fixture([track('a')]);f.player.playTrack=async()=>{throw new Error('network');};
    await f.controller.playNext('guild');assert.equal(f.queue.length,1);assert.equal(f.controller.getCurrentTrack('guild'),null);
});
test('five source failures retain remaining queue and emit a visible failure',async()=>{
    const f=fixture(Array.from({length:7},(_,i)=>({...track(String(i)),encoded:undefined})),async()=>({loadType:'empty'}));
    let failure;f.controller.on('failure',event=>{failure=event;});
    await f.controller.playNext('guild');assert.equal(f.queue.length,2);assert.match(failure.message,/resume/);
});
test('an idle connected player starts when tracks are added',async()=>{
    const f=fixture();await f.controller.enqueue('guild','voice',{id:'user',username:'User'},'new song');
    assert.equal(f.plays.length,1);assert.equal(f.queue.length,0);
});
test('repeated pause does not add elapsed time twice',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');
    await f.controller.pause('guild',true);const before=f.controller.getPlayerState('guild').position;
    await new Promise(resolve=>setTimeout(resolve,10));await f.controller.pause('guild',true);
    assert.equal(f.controller.getPlayerState('guild').position,before);
});
test('start events record history exactly once',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');
    const event=f.event(f.controller.getCurrentTrack('guild'));
    f.player.emit('start',event);f.player.emit('start',event);await f.flush();assert.equal(f.history.length,1);
});
test('early finite endings are flagged while explicit skip is not',async()=>{
    const f=fixture([track('a'),track('b')]);await f.controller.playNext('guild');
    f.player.emit('end',f.event(f.controller.getCurrentTrack('guild')));await f.flush();assert.equal(f.controller.diagnostics.earlyEndings,1);
    await f.controller.skip('guild');assert.equal(f.controller.diagnostics.earlyEndings,1);
});
test('queue exhaustion clears state and resume remains safe',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');
    f.player.emit('end',f.event(f.controller.getCurrentTrack('guild')));await f.flush();
    assert.equal(f.controller.getCurrentTrack('guild'),null);await f.controller.pause('guild',false);assert.equal(f.plays.length,1);
});
test('filter presets replace previous filters without changing global volume',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');await f.controller.volume('guild',25);
    await f.controller.filter('guild','nightcore');await f.controller.filter('guild','bassboost');
    assert.equal(f.player.filters.timescale,null);assert.equal(f.player.volume,25);
});
test('multi-query parsing preserves unknown trailing words and recognizes both flags',async()=>{
    const f=fixture();const result=await f.controller.enqueue('guild','voice',{id:'user',username:'User'},'one&&two -s -r');
    assert.equal(result.count,2);assert.equal(result.flags.shuffle,true);assert.equal(result.flags.reverse,true);
});

test('volume and filter changes preserve pause state for library reconnection',async()=>{
    const f=fixture([track('a')]);await f.controller.playNext('guild');await f.controller.pause('guild',true);
    await f.controller.volume('guild',30);await f.controller.filter('guild','nightcore');
    assert.equal(f.player.paused,true);assert.equal(f.controller.getPlayerState('guild').paused,true);
});

test('resume rejoins after a voice close and preserves current position and queue',async()=>{
    const f=fixture([track('a'),track('b')]);await f.controller.playNext('guild');
    f.player.emit('update',{state:{position:32000,connected:true}});
    f.player.emit('closed',{code:4014,reason:'Disconnected'});
    assert.equal(f.controller.getPlayerState('guild').connected,false);
    await f.controller.pause('guild',false,'voice');
    assert.equal(f.plays.length,2);assert.ok(f.plays[1].position >= 32000);
    assert.equal(f.controller.getCurrentTrack('guild').id,'a');assert.equal(f.queue[0].id,'b');
    assert.equal(f.controller.getPlayerState('guild').connected,true);
    assert.equal(f.player.listenerCount('end'),1);
});

test('resume can join a channel and consume a persisted queue without an existing player',async()=>{
    const f=fixture([track('a')]);await f.shoukaku.leaveVoiceChannel('guild');
    await f.controller.pause('guild',false,'voice');assert.equal(f.plays.length,1);assert.equal(f.queue.length,0);
});

test('five immediate engine load failures stop automatic advancement',async()=>{
    const f=fixture(Array.from({length:7},(_,i)=>track(String(i))));await f.controller.playNext('guild');
    for(let i=0;i<5;i++){f.player.emit('end',f.event(f.controller.getCurrentTrack('guild'),'loadFailed'));await f.flush();}
    assert.equal(f.plays.length,5);assert.equal(f.queue.length,2);assert.match((await f.controller.snapshot('guild')).playbackError,/resume/);
});

test('livestream terminal events are excluded from early-ending diagnostics',async()=>{
    const f=fixture([{...track('live'),info:{...track('live').info,isStream:true}}]);await f.controller.playNext('guild');
    f.player.emit('end',f.event(f.controller.getCurrentTrack('guild')));await f.flush();
    assert.equal(f.controller.diagnostics.earlyEndings,0);
});
