import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,readForecast,parseCandidates,selectRecommendations,ORIGIN} from '../supabase/functions/ai-outing/recommend.mjs';
import {createHandler} from '../supabase/functions/ai-outing/handler.mjs';
import {dateLimits} from '../ai-outing-ui.js';
const now=new Date('2026-11-12T00:00:00Z'),date='2026-11-12';
const daily=(code=0,rain=10,wind=10)=>({daily:{time:[date],weather_code:[code],precipitation_probability_max:[rain],wind_speed_10m_max:[wind],temperature_2m_max:[20],temperature_2m_min:[12]}});
const candidate=(name,type='屋内')=>({name,area:'横浜',address:'横浜市',latitude:35.5,longitude:139.6,type,suitable_for_4_and_6:true,open_on_date:true,indoor_plan:type==='屋内'?'屋内展示と子供の体験':'',child_reason:'4歳・6歳向けの展示',age_notes:'年齢条件を確認',opening_notes:'営業案内を確認',budget_per_person:0,official_url:`https://example.com/${name}`,source_urls:[`https://example.com/${name}`]});
function response(candidates){return {status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:candidates.map(p=>({url:p.official_url,title:p.name}))}},{type:'message',content:[{type:'output_text',text:JSON.stringify({candidates}),annotations:[]}]}]};}
test('date horizon, impossible dates and budget validation; two-hour cap cannot be overridden',()=>{
 assert.equal(validateRequest({date,maxDriveMinutes:999},now).maxDriveMinutes,120);
 assert.equal(validateRequest({date,budget:0},now).budget,0);
 for(const body of [{date:'2026-11-11'},{date:'2026-11-28'},{date:'2026-02-30'},{date,budget:-1}])assert.throws(()=>validateRequest(body,now));
 assert.deepEqual(dateLimits(now),{min:date,max:'2026-11-27'});
});
test('forecast rules exclude outdoor on rain, snow, thunder, fog or wind, and reject missing forecast',()=>{
 assert.equal(readForecast(daily(),date).indoor_only,false);
 for(const args of [[61,10,10],[71,10,10],[95,10,10],[45,10,10],[3,40,10],[0,10,36]])assert.equal(readForecast(daily(...args),date).indoor_only,true);
 assert.throws(()=>readForecast({daily:{time:[date]}},date));
});
test('requires actual completed search, cited official URLs and suitable ages/open date',()=>{
 assert.equal(parseCandidates(response([candidate('A')])).length,1);
 assert.equal(parseCandidates(response([{...candidate('A'),source_urls:['https://fake.example/']}])).length,0);
 assert.equal(parseCandidates(response([{...candidate('A'),suitable_for_4_and_6:false}])).length,0);
 assert.equal(parseCandidates(response([{...candidate('A'),open_on_date:false}])).length,0);
 assert.throws(()=>parseCandidates({status:'completed',output:[]}));
});
test('checks actual route seconds, candidate weather, budget and returns up to three',()=>{
 const good=readForecast(daily(),date),bad=readForecast(daily(61),date),params={date,maxDriveMinutes:120,budget:null};
 const places=parseCandidates(response([candidate('A','屋外'),candidate('B'),candidate('C'),candidate('D'),candidate('E')]));
 assert.deepEqual(selectRecommendations(places,[600,7200,7201,null,900],[bad,good,good,good,good],good,params).map(p=>p.name),['B','E']);
 assert.equal(selectRecommendations(places,[600,600,600,600,600],[good,good,good,good,good],good,params).length,3);
 assert.equal(selectRecommendations([places[0]],[600],[good],bad,params).length,0);
 assert.equal(selectRecommendations([{...places[1],budget_per_person:null}],[600],[good],good,{...params,budget:0}).length,0);
});
function fixture({key='test-key',rain=false,quota=true,weatherFailure=false,fallbackWeather=false}={}){
 const calls=[],places=[candidate('A'),candidate('B','屋外'),candidate('C')];
 const env=name=>({SUPABASE_URL:'https://project.example',SUPABASE_ANON_KEY:'public-key',OPENAI_API_KEY:key})[name];
 const fetcher=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'user-1'});
  if(url.includes('api.open-meteo.com')){if(weatherFailure)throw new Error('network');return Response.json(daily(rain?61:0));}
  if(url.includes('api.met.no')&&fallbackWeather)return Response.json({properties:{timeseries:[0,6,12].map(hour=>({time:`${date}T${String(hour).padStart(2,'0')}:00:00Z`,data:{instant:{details:{air_temperature:18,wind_speed:2}},next_6_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}}}))}});
  if(url.endsWith('consume_ai_request'))return Response.json(quota);
  if(url.includes('/rest/v1/outings?'))return Response.json([{name:'登録済み候補',area:'横浜'}]);
  if(url==='https://api.openai.com/v1/responses')return Response.json(response(places));
  if(url.includes('router.project-osrm.org'))return Response.json({code:'Ok',durations:[[1800,7200,7201]]});
  throw new Error('Unexpected URL');
 };
 return {calls,handler:createHandler({env,fetch:fetcher,now:()=>now})};
}
const request=body=>new Request('https://project.example/functions/v1/ai-outing',{method:'POST',headers:{Authorization:'Bearer fake-user-token','Content-Type':'application/json',Origin:'https://showatanabe66.github.io'},body:JSON.stringify(body)});
test('authenticated pipeline searches the web, verifies weather/routes, caches without another quota charge',async()=>{
 const {handler,calls}=fixture();const result=await handler(request({date}));assert.equal(result.status,200);
 const data=await result.json();assert.deepEqual(data.recommendations.map(p=>p.name),['A','B']);
 const search=calls.find(call=>call.url==='https://api.openai.com/v1/responses');const body=JSON.parse(search.options.body);
 assert.equal(body.tools[0].type,'web_search');assert.equal(body.tool_choice,'required');assert.equal(body.store,false);assert.ok(body.input.includes('登録済み候補'));
 const cached=await (await handler(request({date}))).json();assert.equal(cached.cached,true);
 assert.equal(calls.filter(call=>call.url.endsWith('consume_ai_request')).length,1);
});
test('rain returns only indoor candidates and never pads to three',async()=>{
 const {handler}=fixture({rain:true});const data=await (await handler(request({date}))).json();
 assert.deepEqual(data.recommendations.map(p=>p.name),['A']);assert.ok(data.message.includes('1件'));
});
test('missing configuration, daily cap and weather outage do not trigger paid search',async()=>{
 for(const [options,expected] of [[{key:''},503],[{quota:false},429],[{weatherFailure:true},503]]){
  const {handler,calls}=fixture(options);assert.equal((await handler(request({date}))).status,expected);
  assert.equal(calls.filter(call=>call.url==='https://api.openai.com/v1/responses').length,0);
 }
});
test('unauthenticated callers and foreign origins are rejected',async()=>{
 const {handler,calls}=fixture();assert.equal((await handler(new Request('https://project.example',{method:'POST'}))).status,401);
 const foreign=new Request('https://project.example',{method:'POST',headers:{Origin:'https://other.example'}});assert.equal((await handler(foreign)).status,403);assert.equal(calls.length,0);
});
test('result cards keep searched text safe, show sources, and save only on click',async()=>{
 const {renderAiRecommendations}=await import('../ai-outing-ui.js');
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.className='';this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(key,value){this.attributes[key]=value;}
 }
 globalThis.document={createElement:tag=>new Element(tag)};
 const root=new Element('div'),weather=readForecast(daily(),date);
 const place={...candidate('A'),name:'<img onerror=alert(1)>',weather,drive_minutes:30,sources:[{url:'https://example.com/A',title:'施設公式ページ'}],weather_reason:'天気に適合'};
 let saves=0;
 renderAiRecommendations(root,{date,origin_weather:weather,message:'1件',recommendations:[place],travel_note:'経路の目安',weather_note:'予報',checked_at:now.toISOString()},async()=>{saves++;return '保存しました';});
 const flatten=node=>[node,...node.children.flatMap(flatten)];
 assert.equal(saves,0);assert.ok(flatten(root).some(node=>node.tag==='h3'&&node.textContent==='<img onerror=alert(1)>'));
 assert.ok(flatten(root).filter(node=>node.tag==='a').every(node=>node.href.startsWith('https:')));
 const save=flatten(root).find(node=>node.tag==='button');await save.onclick();assert.equal(saves,1);assert.equal(save.disabled,true);
});

test('a primary weather outage no longer blocks the complete recommendation pipeline',async()=>{
 const {handler,calls}=fixture({weatherFailure:true,fallbackWeather:true});
 const result=await handler(request({date}));assert.equal(result.status,200);
 const data=await result.json();assert.equal(data.origin_weather.source_name,'MET Norway');
 assert.deepEqual(data.recommendations.map(place=>place.name),['A','B']);
 assert.ok(calls.some(call=>call.url==='https://api.openai.com/v1/responses'));
});
