import test from 'node:test';import assert from 'node:assert/strict';
import {scoreSpot,rankSpots,mergeSpots,hasCoordinates} from '../outing-model.js';
import {parseDaily,createForecastClient} from '../outing-forecast.js';
const outdoor={id:'park',name:'公園',type:'屋外',drive_minutes:18,petting:true},indoor={id:'museum',name:'博物館',type:'屋内',drive_minutes:18};
test('weather changes rankings without removing visited places; reasons stay at most three',()=>{
 const sunny={code:0,precipProb:0,windKmh:10},rain={code:61,precipProb:90,windKmh:10};
 assert.equal(rankSpots([outdoor,indoor],{},sunny)[0].id,'park');assert.equal(rankSpots([outdoor,indoor],{},rain)[0].id,'museum');
 assert.equal(scoreSpot(outdoor,sunny).score,50);assert.equal(scoreSpot(indoor,rain).score,50);
 const windy=scoreSpot({...outdoor,rating:4.5,visited:true},{...sunny,windKmh:35});assert.equal(windy.score,54);assert.ok(windy.reasons[0].includes('強風'));assert.ok(windy.reasons.length<=3);
 assert.equal(rankSpots([{...outdoor,visited:true},indoor],{},sunny).length,2);
 assert.equal(rankSpots([outdoor,indoor],{park:rain,museum:sunny},sunny)[0].id,'museum');
});
test('merges catalog with existing saved venues while preserving saved identity and marks',()=>{
 const all=mergeSpots([{...outdoor,name:'Ａ公園'}],[{...outdoor,id:'uuid',name:'A 公園',favorite:true}],{park:{visited:true}});
 assert.equal(all.length,1);assert.equal(all[0].id,'uuid');assert.equal(all[0].favorite,true);
 assert.equal(mergeSpots([outdoor],[],{park:{favorite:true}})[0].favorite,true);assert.equal(hasCoordinates({latitude:null,longitude:null}),false);
});
test('weather client caches valid data and treats failed or out of range forecasts as unknown',async()=>{
 const data={daily:{time:['2026-11-21'],weather_code:[0],temperature_2m_max:[18],temperature_2m_min:[8],precipitation_probability_max:[0],precipitation_sum:[0],wind_speed_10m_max:[10]}};let calls=0;
 const client=createForecastClient(async()=>{calls++;return {ok:true,json:async()=>data};});const points=[{id:'park',latitude:35,longitude:139}];
 const one=await client(points);assert.equal(parseDaily(one.park.data,'2026-11-21').precipProb,0);await client(points);assert.equal(calls,1);await client(points,{refresh:true});assert.equal(calls,2);
 assert.equal(parseDaily(data,'2026-12-01'),null);assert.deepEqual(await createForecastClient(async()=>{throw Error('offline');})(points),{});
});
