import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionFlagsBits} from 'discord.js';
import {AccessService} from '../src/services/access.js';
import {ActionService} from '../src/services/actions.js';
import {AiService,parseAnswer} from '../src/services/ai.js';
import {CommandHandler} from '../src/handlers/commandHandler.js';
import {commands} from '../src/commands/registry.js';
import {deadline} from '../src/utils/serial.js';
import {integer} from '../src/utils/validation.js';
test('voice permissions allow same-channel members and administrator overrides',async()=>{
    const member={voice:{channelId:'other'},permissions:{has:()=>false},guild:{members:{me:{voice:{channelId:'bot'}}}}};
    const guild={members:{fetch:async()=>member}};
    const access=new AccessService({guilds:{cache:new Map([['guild',guild]])}});
    await assert.rejects(access.check('guild','user',true),/voice channel/);
    member.voice.channelId='bot';assert.equal((await access.check('guild','user',true)).channelId,'bot');
    member.voice.channelId=null;member.permissions.has=flag=>flag === PermissionFlagsBits.Administrator;
    assert.equal((await access.check('guild','user',true)).channelId,'bot');
});
test('an authenticated user outside the guild is rejected',async()=>{
    const access=new AccessService({guilds:{cache:new Map([['guild',{members:{fetch:async()=>{throw new Error('Unknown member');}}}]])}});
    await assert.rejects(access.check('guild','user'),{status:403});
});
test('registration is verified and errors do not report success',async()=>{
    const handler=new CommandHandler();
    await assert.rejects(handler.register({put:async()=>{throw new Error('Discord unavailable');}},'/route'),/Discord unavailable/);
    await assert.rejects(handler.register({put:async()=>{},get:async()=>[]},'/route'),/does not match/);
    const names=await handler.register({put:async()=>{},get:async()=>commands.map(c=>c.data.toJSON())},'/route');
    assert.equal(names.length,18);
    for(const command of commands)assert.doesNotThrow(()=>command.data.toJSON());
    const incomplete=commands.map(c=>c.data.toJSON());incomplete.find(c=>c.name === 'playlist').options=[];
    await assert.rejects(handler.register({put:async()=>{},get:async()=>incomplete},'/route'),/definition does not match/);
});
test('application registration always publishes globally and optionally synchronizes a guild',async()=>{
    const handler=new CommandHandler();
    const expected=commands.map(command=>command.data.toJSON());
    for (const guildId of [undefined,'guild']) {
        const calls=[];const verified=[];
        const rest={put:async(route,{body})=>{calls.push(['put',route]);assert.deepEqual(body,expected);},
            get:async route=>{calls.push(['get',route]);return expected;}};
        const names=await handler.registerApplication(rest,'app',guildId,(scope)=>verified.push(scope));
        const global='/applications/app/commands';const guild='/applications/app/guilds/guild/commands';
        assert.deepEqual(calls,guildId ? [['put',global],['get',global],['put',guild],['get',guild]] : [['put',global],['get',global]]);
        assert.deepEqual(verified,guildId ? ['global','guild:guild'] : ['global']);
        assert.deepEqual(names,expected.map(command=>command.name).sort());
    }
});

test('application registration propagates failures and verifies each scope',async()=>{
    const handler=new CommandHandler();const expected=commands.map(command=>command.data.toJSON());
    for (const failingScope of ['global','guild']) {
        for (const failure of ['publication','names','definition']) {
            const verified=[];
            const fails=route=>route.includes('/guilds/') === (failingScope === 'guild');
            const rest={put:async route=>{if(fails(route) && failure === 'publication')throw new Error('Discord unavailable');},
                get:async route=>{
                    if(!fails(route))return expected;
                    if(failure === 'names')return [];
                    const live=structuredClone(expected);live[0].description='Wrong definition';return live;
                }};
            await assert.rejects(handler.registerApplication(rest,'app','guild',scope=>verified.push(scope)),
                failure === 'publication' ? /Discord unavailable/ : /does not match/);
            assert.deepEqual(verified,failingScope === 'global' ? [] : ['global']);
        }
    }
});

test('AI rejects non-allowlisted actions before executing anything',()=>{
    assert.throws(()=>parseAnswer('{"reply":"ok","action":{"name":"shell","args":{}}}'),/unsupported/);
});
test('AI falls back after a provider error and reports real execution failure',async()=>{
    const requests=[];let saved;
    const db={memories:async()=>[],saveMemories:async(_g,_u,turns)=>{saved=turns;}};
    const actions={access:{check:async()=>{}},execute:async()=>{throw Object.assign(new Error('Join voice'),{status:403});}};
    const ai=new AiService(db,actions,{settings:{geminiKey:'secret',geminiModel:'test',groqKey:'secret',groqModel:'test'},fetcher:async url=>{
        requests.push(url);
        if(url.includes('googleapis'))return {ok:false,status:503};
        return {ok:true,json:async()=>({choices:[{message:{content:'{"reply":"Requested.","action":{"name":"skip","args":{}}}'}}]})};
    }});
    const reply=await ai.respond('guild',{id:'user'},'skip');assert.match(reply,/failed — Join voice/);assert.equal(requests.length,2);assert.equal(saved.length,2);
});
test('disabled AI makes no provider request',async()=>{
    const ai=new AiService({}, {},{settings:{},fetcher:async()=>{throw new Error('Should not call');}});
    assert.match(await ai.respond('guild',{id:'user'},'hi'),/disabled/);
});
test('action service checks permissions before applying a control',async()=>{
    let played=false;
    const actions=new ActionService({skip:async()=>{played=true;}},{},{check:async()=>{throw Object.assign(new Error('Denied'),{status:403});}});
    await assert.rejects(actions.execute('guild',{id:'user'},'skip'),{status:403});assert.equal(played,false);
});
test('invalid numeric values are rejected instead of coerced to safe-looking values',()=>{
    for(const value of [null,undefined,'',true,'1e2','-1','abc',101,1.2])assert.throws(()=>integer(value,0,100));
});
test('resolution deadline rejects stalled requests',async()=>{
    await assert.rejects(deadline(()=>new Promise(()=>{}),10),/timed out/);
});
