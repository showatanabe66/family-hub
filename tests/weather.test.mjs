import test from 'node:test';
import assert from 'node:assert/strict';
import {readMetForecast,createWeatherClient} from '../supabase/functions/ai-outing/weather.mjs';
import {rainText} from '../ai-outing-ui.js';
const date='2026-11-14',now=()=>new Date('2026-11-13T00:00:00Z');
function met(symbol='clearsky_day',wind=2,amount=0){return {properties:{timeseries:[0,6,12].map(hour=>({time:`${date}T${String(hour).padStart(2,'0')}:00:00Z`,data:{instant:{details:{air_temperature:15+hour/6,wind_speed:wind}},next_6_hours:{summary:{symbol_code:symbol},details:{precipitation_amount:amount}}}}))}};}
test('fallback aggregates Japan dates and never invents precipitation probability',()=>{
 const weather=readMetForecast(met(),date);
 assert.equal(weather.source_name,'MET Norway');assert.equal(weather.precipitation_probability,null);assert.equal(weather.indoor_only,false);
 assert.equal(rainText(weather),'降水確率の提供なし');
 assert.equal(weather.wind_kmh,7.2);assert.equal(weather.temperature_max,17);
 for(const [symbol,wind,amount] of [['rain',2,1],['snow',2,0],['clearsky_day',10,0],['fog',2,0]])assert.equal(readMetForecast(met(symbol,wind,amount),date).indoor_only,true);
 assert.throws(()=>readMetForecast(met(),'2026-11-15'));
});
test('primary timeout switches to alternate and uses cross-instance persistent cache',async()=>{
 const records=new Map(),calls=[];
 const persistentCache={get:async key=>records.get(key),set:async(key,value)=>records.set(key,value)};
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('api.open-meteo.com'))throw new Error('timeout');
  assert.ok(url.includes('lat=35.4303&lon=139.5567'));
  assert.ok(options.headers['User-Agent'].includes('github.com/showatanabe66/family-hub'));
  return Response.json(met('rain',2,1),{headers:{Expires:'Fri, 13 Nov 2026 01:00:00 GMT'}});
 };
 const client=createWeatherClient({fetch:fetcher,now,persistentCache});
 assert.equal((await client(35.43035,139.55675,date)).source_name,'MET Norway');
 const client2=createWeatherClient({fetch:fetcher,now,persistentCache});
 assert.equal((await client2(35.43035,139.55675,date)).indoor_only,true);
 assert.equal(calls.filter(call=>call.url.includes('api.met.no')).length,1);
 assert.ok(records.values().next().value.expires>=now().getTime()+3*3600000);
});
test('incomplete primary forecast also falls back; failure of both providers stays an error',async()=>{
 const incomplete=createWeatherClient({now,fetch:async url=>Response.json(url.includes('api.open-meteo.com')?{daily:{time:[date]}}:met())});
 assert.equal((await incomplete(35.43,139.55,date)).source_name,'MET Norway');
 const down=createWeatherClient({now,fetch:async()=>new Response('unavailable',{status:503})});
 await assert.rejects(()=>down(35.43,139.55,date),/2つのサービス/);
});
