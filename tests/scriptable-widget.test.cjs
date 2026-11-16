const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../widgets/Family-Hub.js'),'utf8');
const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
function payload(){return {version:1,date:today(),generated_at:new Date().toISOString(),schedule_count:4,schedules:[{name:'テストの予定',time:'09:00',source:'家族'},{name:'別の予定',time:'',source:'家族'}],task_count:2,shopping_count:3};}
async function run({family='medium',offline=false,revoked=false,cached=null,inApp=false,alerts=[]}={}){
 const files=new Map(),keys=new Map(),widgets=[],requests=[];
 const token='a'.repeat(64),settings={key:token,cacheId:'test-cache'};
 if(!inApp)keys.set('watanabe.familyhub.widget.v1',JSON.stringify(settings));
 if(cached)files.set('/library/watanabe-family-hub-widget.json',JSON.stringify({cacheId:'test-cache',data:cached}));
 class Stack{constructor(){this.children=[];}addText(value){const node={text:value};this.children.push(node);return node;}addStack(){const stack=new Stack();this.children.push(stack);return stack;}addSpacer(){}centerAlignContent(){}layoutVertically(){}setPadding(){}}
 class ListWidget extends Stack{async presentMedium(){this.previewed=true;}}
 class Request{constructor(url){this.url=url;}async loadJSON(){requests.push(this);this.response={statusCode:revoked?401:offline?503:200};if(offline)throw Error('network');return revoked?{error:'revoked'}:payload();}}
 class Alert{constructor(){this.answer=alerts.shift()??{choice:-1};}addAction(){}addCancelAction(){}addSecureTextField(){}addDestructiveAction(){}async presentAlert(){return this.answer.choice;}async presentSheet(){return this.answer.choice;}textFieldValue(){return this.answer.text||'';}}
 class Color{constructor(value){this.value=value;}static dynamic(light){return light;}}
 class Size{constructor(width,height){this.width=width;this.height=height;}}
 const context={FileManager:{local:()=>({libraryDirectory:()=>'/library',joinPath:(a,b)=>a+'/'+b,fileExists:path=>files.has(path),remove:path=>files.delete(path),writeString:(path,data)=>files.set(path,data),readString:path=>{if(!files.has(path))throw Error('missing');return files.get(path);}})},Keychain:{get:key=>{if(!keys.has(key))throw Error('missing');return keys.get(key);},contains:key=>keys.has(key),set:(key,data)=>keys.set(key,data),remove:key=>keys.delete(key)},ListWidget,Request,Alert,Color,Size,Font:{systemFont:()=>({}),semiboldSystemFont:()=>({})},config:{widgetFamily:family,runsInApp:inApp},URLScheme:{forRunningScript:()=> 'scriptable:///run/Family%20Hub'},Script:{setWidget:widget=>widgets.push(widget),complete:()=>{}},UUID:{string:()=> 'new-cache-id'},Safari:{open:async()=>{}}};
 await vm.runInNewContext('(async()=>{'+source+'})()',context);
 function texts(node){return [...(node.text?[node.text]:[]),...(node.children||[]).flatMap(texts)];}
 return {files,keys,widgets,requests,texts:widgets.flatMap(texts),token};
}
test('small, medium and large widgets show schedules and counts with no secrets in URLs/cache',async()=>{
 for(const family of ['small','medium','large']){
  const result=await run({family});assert.ok(result.texts.includes('今日の予定 4件'));assert.ok(result.texts.some(text=>text.includes('タスク 2')));assert.ok(result.texts.some(text=>text.includes('買い物 3')));
  assert.ok(result.widgets[0].url.includes('view=schedules'));assert.ok(!result.widgets[0].url.includes(result.token));
  assert.ok([...result.files.values()].every(value=>!value.includes(result.token)));assert.equal(result.requests[0].headers['X-Widget-Key'],result.token);
 }
});
test('offline shows marked same-day cache, but never presents yesterday as today',async()=>{
 const saved=payload();const result=await run({offline:true,cached:saved});assert.ok(result.texts.some(text=>text.includes('保存分')));assert.ok(result.texts.includes('テストの予定'));
 const yesterday=new Date(Date.now()-86400000+9*3600000).toISOString().slice(0,10);
 const stale=await run({offline:true,cached:{...saved,date:yesterday}});assert.ok(!stale.texts.includes('テストの予定'));assert.ok(stale.texts.some(text=>text.includes('通信を確認')));
});
test('revocation clears settings and private cache instead of falling back to cached data',async()=>{
 const result=await run({revoked:true,cached:payload()});assert.equal(result.keys.size,0);assert.equal(result.files.size,0);assert.ok(!result.texts.includes('テストの予定'));
});
test('initial pairing saves only a verified key to Keychain and presents a preview',async()=>{
 const result=await run({inApp:true,alerts:[{choice:0,text:'a'.repeat(64)}]});assert.equal(result.keys.size,1);assert.ok(result.widgets[0].previewed);assert.ok([...result.files.values()].every(value=>!value.includes(result.token)));
 const invalid=await run({inApp:true,alerts:[{choice:0,text:'not-a-key'},{choice:0}]});assert.equal(invalid.keys.size,0);assert.equal(invalid.requests.length,0);
});
