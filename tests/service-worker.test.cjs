const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('refreshes application assets and serves the exact version offline without deleting other caches',async()=>{
 const handlers={},stores=new Map([['family-hub-shell-v11',new Map()],['unrelated-app',new Map()]]);
 let offline=false;
 const requests=[];
 const fetcher=async(request,options={})=>{
  requests.push({request,options});
  if(offline)throw Error('offline');
  return new Response((options.cache==='no-cache'||request.cache==='reload')?'latest-code':'old-http-cache');
 };
 const cacheApi={
  keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),
  open:async name=>{
   if(!stores.has(name))stores.set(name,new Map());
   const entries=stores.get(name);
   return {addAll:async reqs=>{for(const request of reqs)entries.set(request.url,await fetcher(request));},put:async(request,response)=>entries.set(request.url,response),};
  },
  match:async request=>{for(const entries of stores.values()){const response=entries.get(request.url);if(response)return response.clone();}},
 };
 const self={location:{href:'https://example.com/family-hub/service-worker.js',origin:'https://example.com'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:()=>{},clients:{claim:()=>{}}};
 vm.runInNewContext(fs.readFileSync('/workspace/family-hub/service-worker.js','utf8'),{self,caches:cacheApi,fetch:fetcher,Request,URL,Promise});
 let install;handlers.install({waitUntil:value=>install=value});await install;
 assert.ok(requests.some(({request})=>request.url.endsWith('app.js?v=ai-weather-3')&&request.cache==='reload'));
 let activate;handlers.activate({waitUntil:value=>activate=value});await activate;
 assert.equal(stores.has('family-hub-shell-v11'),false);assert.equal(stores.has('unrelated-app'),true);
 const request=new Request('https://example.com/family-hub/app.js?v=ai-weather-3');
 let response;handlers.fetch({request,respondWith:value=>response=value});
 assert.equal(await (await response).text(),'latest-code');
 await new Promise(resolve=>setImmediate(resolve));
 offline=true;handlers.fetch({request,respondWith:value=>response=value});
 assert.equal(await (await response).text(),'latest-code');
 let intercepted=false;handlers.fetch({request:new Request('https://api.example.com/forecast'),respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
