import {test,expect,Page,WebSocketRoute} from '@playwright/test';
import {QueueResponse,Playlist} from '../src/lib/types';

async function dashboard(page:Page,{authenticated=true,admin=true}={}) {
    const requests:{path:string;method:string;body:Record<string,unknown>|null}[]=[];
    const sockets:WebSocketRoute[]=[];
    let denied=false;
    let saved:Playlist|null=null;
    const state:QueueResponse={guildId:'12345',revision:10,playbackError:null,
        current:{id:'current',info:{title:'Playing song',uri:'https://example.com/song',length:100000,author:'Artist'}},
        queue:[{id:'next',info:{title:'Next song',uri:'https://example.com/next',length:90000}},
            {id:'last',info:{title:'Last song',uri:'https://example.com/last',length:90000}}],
        playerState:{position:30000,duration:100000,paused:false,connected:true},settings:{volume:80,filter:'reset'}};
    await page.route('**/auth/**',async route => {
        const path=new URL(route.request().url()).pathname;
        requests.push({path,method:route.request().method(),body:null});
        await route.fulfill({json:path === '/auth/user' ? {authenticated,user:authenticated ? {id:'user',username:'Listener',avatar:null} : undefined} : {success:true}});
    });
    await page.route('**/api/**',async route => {
        const req=route.request();const path=new URL(req.url()).pathname;
        const body=req.postDataJSON() as Record<string,unknown>|null;
        requests.push({path,method:req.method(),body});
        let json:unknown={success:true};
        if(path === '/api/guilds')json={guilds:[{id:'12345',name:'First server',admin,channelId:'voice'}, {id:'67890',name:'Second server',admin:false,channelId:'other'}]};
        else if(path.startsWith('/api/queue/'))json={...state,guildId:path.split('/').pop()};
        else if(path.startsWith('/api/history/'))json={history:[{title:'Previous song',url:'https://example.com/previous',played_at:'2026-10-06T12:00:00Z'}]};
        else if(path.startsWith('/api/rank/'))json={user_id:'user',level:2,xp:400,rank:1};
        else if(path.startsWith('/api/leaderboard/'))json={leaderboard:[{user_id:'user',level:2,xp:400}]};
        else if(path === '/api/playlists' && req.method() === 'POST'){saved={id:1,name:String(body?.name),count:0,items:[]};json=saved;}
        else if(path === '/api/playlists')json={playlists:saved ? [saved] : []};
        else if(path === '/api/playlists/1' && req.method() === 'DELETE')saved=null;
        else if(path === '/api/playlists/1')json=saved;
        else if(path === '/api/playlists/1/items'){saved!.items=[{id:11,title:String(body?.title),url:String(body?.url),duration:60,position:1}];saved!.count=1;json=saved!.items[0];}
        else if(path === '/api/playlists/1/items/1'){saved!.items=[];saved!.count=0;}
        if(denied && path.startsWith('/api/control/'))await route.fulfill({status:403,json:{error:'Join the bot voice channel'}});
        else await route.fulfill({json});
    });
    await page.routeWebSocket('**/api/live?*',socket => {
        sockets.push(socket);
        socket.send(JSON.stringify({...state,guildId:new URL(socket.url()).searchParams.get('guildId')}));
    });
    await page.goto('/');
    return {requests,sockets,state,deny:()=>{denied=true;},send:(index=0) => sockets[index].send(JSON.stringify(state))};
}

test('logged-out visitors see login and no music controls',async({page}) => {
    await dashboard(page,{authenticated:false});
    await expect(page.getByRole('button',{name:'Login with Discord'})).toBeEnabled();
    await expect(page.getByRole('button',{name:'Add to queue'})).toHaveCount(0);
});

test('music controls submit actions and retain permission errors across live updates',async({page}) => {
    const d=await dashboard(page);
    await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();
    await page.getByLabel('Add music').fill('one && two -s');await page.getByRole('button',{name:'Add to queue'}).click();
    for(const [name,action] of [['Pause','pause'],['Skip','skip'],['Stop & leave','stop'],['Shuffle','shuffle'],['Clear queue','clear']] as const){
        await page.getByRole('button',{name,exact:true}).click();await expect.poll(()=>d.requests.some(r=>r.path.endsWith('/'+action))).toBe(true);
    }
    await page.getByLabel('Volume',{exact:true}).fill('35');await page.getByRole('button',{name:'Apply volume'}).click();
    for(const preset of ['nightcore','vaporwave','bassboost','reset'])await page.getByLabel('Filter',{exact:true}).selectOption(preset);
    await page.getByRole('button',{name:'Jump to Next song'}).click();
    await page.locator('.queue li').first().dragTo(page.locator('.queue li').last());
    await expect.poll(()=>d.requests.some(r=>r.body?.from === 1 && r.body?.to === 2)).toBe(true);
    expect(d.requests.find(r=>r.path.endsWith('/play'))?.body).toEqual({query:'one && two -s'});
    expect(d.requests.find(r=>r.path.endsWith('/volume'))?.body).toEqual({value:35});
    d.deny();await page.getByRole('button',{name:'Skip',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'Join the bot voice channel'})).toBeVisible();d.state.revision++;d.send();
    await expect(page.getByRole('alert').filter({hasText:'Join the bot voice channel'})).toBeVisible();
});

test('live state handles pause, reconnect, volume editing and server selection',async({page}) => {
    const d=await dashboard(page,{admin:false});
    await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeEnabled();
    await page.getByLabel('Volume',{exact:true}).fill('25');d.state.revision++;d.send();
    await expect(page.getByLabel('Volume',{exact:true})).toHaveValue('25');
    d.state.playerState!.paused=true;d.state.revision++;d.send();
    await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeEnabled();
    await expect(page.getByRole('progressbar')).toHaveAttribute('value','30000');
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    expect(d.requests.some(r=>r.path.endsWith('/resume'))).toBe(true);
    d.sockets[0].close();await expect(page.getByRole('button',{name:'Skip',exact:true})).toBeDisabled();
    d.state.revision=1;d.state.current!.info.title='After reconnect';
    await expect(page.getByRole('heading',{name:'After reconnect'})).toBeVisible();
    await page.getByLabel('Server',{exact:true}).selectOption('67890');
    await expect.poll(()=>d.sockets.length).toBe(3);await expect(page.getByRole('button',{name:'Skip',exact:true})).toBeEnabled();
    await expect(page.getByText('Administrator settings')).toHaveCount(0);
});

test('playlists, memory, administrator settings and logout submit the intended requests',async({page}) => {
    const d=await dashboard(page);
    await page.getByLabel('Name',{exact:true}).fill('Favorites');await page.getByRole('button',{name:'Create',exact:true}).click();
    await page.getByRole('button',{name:'Favorites (0)'}).click();
    await page.getByLabel('Track URL',{exact:true}).fill('https://example.com/audio');await page.getByLabel('Title',{exact:true}).fill('Saved song');
    await page.getByRole('button',{name:'Save track'}).click();await expect(page.getByRole('link',{name:'Saved song'})).toBeVisible();
    await page.getByRole('button',{name:'Load into queue'}).click();await page.getByRole('button',{name:'Remove',exact:true}).click();
    await expect(page.getByRole('link',{name:'Saved song'})).toHaveCount(0);await page.getByRole('button',{name:'Delete',exact:true}).click();
    await page.getByRole('button',{name:'Clear my AI memory'}).click();
    await page.getByLabel('Default volume',{exact:true}).fill('60');await page.getByRole('button',{name:'Save default volume'}).click();
    await expect.poll(()=>d.requests.some(r=>r.path === '/api/settings/12345' && r.body?.volume === 60)).toBe(true);
    expect(d.requests.some(r=>r.path.endsWith('/playlist-load') && r.body?.id === 1)).toBe(true);
    expect(d.requests.some(r=>r.path === '/api/memory/12345/clear')).toBe(true);
    await page.getByRole('button',{name:'Log out',exact:true}).click();
    await expect(page.getByRole('button',{name:'Login with Discord'})).toBeEnabled();
    expect(d.requests.some(r=>r.path === '/auth/logout' && r.method === 'POST')).toBe(true);
});
