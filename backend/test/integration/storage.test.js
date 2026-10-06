import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createClient} from 'redis';
import session from 'express-session';
import RedisStore from 'connect-redis';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../../src/services/database.js';
import {QueueService} from '../../src/services/queue.js';

test('real PostgreSQL applies migrations twice and preserves data',{skip:!process.env.TEST_PG_URL},async()=>{
    const pool=new pg.Pool({connectionString:process.env.TEST_PG_URL});
    const db=new DatabaseService(pool);const guild='test-'+randomUUID().slice(0,20);
    try {
        await db.initializeDatabase();await db.upsertGuildSettings(guild,{volume:42});await db.initializeDatabase();
        assert.equal((await db.getGuildSettings(guild)).volume_preferencial,42);
        await db.awardXp(guild,'user',500);await db.awardXp(guild,'user',100);
        assert.equal(Number((await db.rank(guild,'user')).xp),200);
    } finally {
        await pool.query('DELETE FROM guild_settings WHERE guild_id=$1',[guild]);
        await pool.query('DELETE FROM guild_users WHERE guild_id=$1',[guild]);
        await db.shutdown();
    }
});
test('real Redis queue edits, compare-pop and session persistence',{skip:!process.env.TEST_REDIS_URL},async()=>{
    const client=createClient({url:process.env.TEST_REDIS_URL});client.on('error',()=>{});
    const queue=new QueueService(client);const guild='test-'+randomUUID();
    await queue.connect();
    try {
        const tracks=Array.from({length:3},(_,i)=>({encoded:String(i),info:{title:String(i)}}));
        await queue.add(guild,tracks);const head=await queue.peek(guild);
        await queue.edit(guild,'move',1,3);assert.equal(await queue.next(guild,head),null);
        assert.equal((await queue.getQueue(guild))[2].id,head.id);
        await queue.edit(guild,'jump',2);assert.equal((await queue.getQueue(guild)).length,2);
        const store1=new RedisStore({client,prefix:'integration-session:'});
        const id=randomUUID();const data={cookie:{maxAge:60000},passport:{user:{id:'user'}}};
        await new Promise((resolve,reject)=>store1.set(id,data,error=>error ? reject(error) : resolve()));
        const store2=new RedisStore({client,prefix:'integration-session:'});
        const persisted=await new Promise((resolve,reject)=>store2.get(id,(error,value)=>error ? reject(error) : resolve(value)));
        assert.equal(persisted.passport.user.id,'user');
        await new Promise((resolve,reject)=>store2.destroy(id,error=>error ? reject(error) : resolve()));
        await queue.shuffle(guild);assert.equal((await queue.getQueue(guild)).length,2);
        assert.equal(new Set((await queue.getQueue(guild)).map(t=>t.id)).size,2);
        void session;
    } finally {await queue.clear(guild);await queue.disconnect();}
});
