import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {DatabaseService} from '../src/services/database.js';
test('PostgreSQL migrations preserve legacy rows; playlists, XP and memory work',async()=>{
    const pg=new PGlite();
    const pool={
        on:()=>{},
        query:async(sql,args)=>{const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows ?? result.rows.length};},
        connect:async()=>({...pool,release:()=>{}}),
        end:()=>pg.close()
    };
    const db=new DatabaseService(pool);
    try {
        await pg.exec(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
        await pg.query("INSERT INTO playlists(user_id,name) VALUES('legacy','Old playlist')");
        await pg.query("INSERT INTO playlist_items(playlist_id,url,title) VALUES(1,'https://example.com/track','Old track')");
        const migration=await readFile(new URL('../migrations/002_migration_features.sql',import.meta.url),'utf8');
        await pg.exec(migration);await pg.exec(migration);
        assert.equal((await db.playlist('legacy',1)).items[0].position,1);
        const playlist=await db.createPlaylist('user','Mix');
        await db.addPlaylistItem('user',playlist.id,{url:'https://example.com/a',title:'A'});
        await db.addPlaylistItem('user',playlist.id,{url:'https://example.com/b',title:'B',duration:120});
        await assert.rejects(db.playlist('other',playlist.id),{status:404});
        await assert.rejects(db.addPlaylistItem('other',playlist.id,{url:'https://example.com/c'}),{status:404});
        await db.removePlaylistItem('user',playlist.id,1);
        const list=await db.playlist('user',playlist.id);assert.equal(list.items[0].title,'B');assert.equal(list.items[0].position,1);
        await db.awardXp('guild','user',900);
        await db.awardXp('guild','user',100);
        assert.equal(Number((await db.rank('guild','user')).xp),200);
        await pg.query("UPDATE guild_users SET last_xp_at=NOW()-INTERVAL '61 seconds'");
        await db.awardXp('guild','user',200);
        assert.equal(Number((await db.rank('guild','user')).level),2);
        assert.equal(Number((await db.rank('other','user')).xp),0);
        await db.saveMemories('guild','user',Array.from({length:30},()=>({role:'user',content:'hello'})));
        assert.equal((await db.memories('guild','user')).length,20);
        assert.equal((await db.memories('other','user')).length,0);
        await pg.query("UPDATE conversation_memories SET updated_at=NOW()-INTERVAL '31 days'");
        await db.pruneMemories();assert.equal((await db.memories('guild','user')).length,0);
        await db.recordHistory('guild','Track','https://example.com/a','user');
        assert.equal((await db.getHistory('guild')).length,1);
        await db.upsertGuildSettings('guild',{volume:35});assert.equal((await db.getGuildSettings('guild')).volume_preferencial,35);
        await db.deletePlaylist('user',playlist.id);
        await assert.rejects(db.playlist('user',playlist.id),{status:404});
    } finally {await pg.close();}
});
