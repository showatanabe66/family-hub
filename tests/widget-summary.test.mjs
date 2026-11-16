import test from 'node:test';
import assert from 'node:assert/strict';
import {createWidgetHandler} from '../supabase/functions/widget-summary/handler.mjs';
const key='a'.repeat(64);
const sample={version:1,date:'2026-11-16',generated_at:'2026-11-16T09:00:00.123456+00:00',schedules:[{name:'家族の予定',time:'09:00',source:'家族'}],schedule_count:1,task_count:2,shopping_count:3};
const env=name=>({SUPABASE_URL:'https://project.example',SUPABASE_SERVICE_ROLE_KEY:'server-only-key'})[name];
test('accepts only GET with dedicated keys and hashes the key before database access',async()=>{
 const calls=[];
 const handler=createWidgetHandler({env,fetch:async(url,options)=>{calls.push({url,options});return Response.json(sample);}});
 assert.equal((await handler(new Request('https://project.example',{method:'POST'}))).status,405);
 assert.equal((await handler(new Request('https://project.example'))).status,401);
 assert.equal(calls.length,0);
 const result=await handler(new Request('https://project.example?owner_id=other-user',{headers:{'X-Widget-Key':key}}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{...sample,generated_at:'2026-11-16T09:00:00.123Z'});
 assert.equal(calls[0].url,'https://project.example/rest/v1/rpc/get_widget_summary');
 const body=JSON.parse(calls[0].options.body);assert.match(body.p_token_hash,/^[a-f0-9]{64}$/);assert.notEqual(body.p_token_hash,key);
 assert.deepEqual(Object.keys(body),['p_token_hash']);
 assert.match(result.headers.get('Cache-Control'),/no-store/);
});
test('expired or revoked keys return 401 and data errors never become zero counts',async()=>{
 const request=()=>new Request('https://project.example',{headers:{'X-Widget-Key':key}});
 const revoked=createWidgetHandler({env,fetch:async()=>Response.json(null)});
 assert.equal((await revoked(request())).status,401);
 const down=createWidgetHandler({env,fetch:async()=>new Response('error',{status:503})});
 const result=await down(request());assert.equal(result.status,503);assert.equal('task_count' in await result.json(),false);
});
