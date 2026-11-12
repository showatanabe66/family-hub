import test from 'node:test';
import assert from 'node:assert/strict';
import {filterOutings,createOutingBrowser} from '../outing-browser.js';
const places=[
 {id:'a',name:'公園',area:'横浜',memo:'水遊び ピクニック',category:'公園',type:'屋外',drive_minutes:0,budget_per_person:0,favorite:true,visited:false},
 {id:'b',name:'博物館',area:'東京',memo:'雨の日',category:'博物館',type:'屋内',drive_minutes:60,budget_per_person:1500,favorite:false,visited:true},
 {id:'c',name:'遊園地',area:'横浜',category:'遊園地',type:'両方',drive_minutes:null,budget_per_person:null,favorite:false,visited:false},
];
test('searches multiple terms, memo and normalized text',()=>{
 assert.deepEqual(filterOutings(places,{query:'横浜 水遊び'}).map(p=>p.id),['a']);
 assert.deepEqual(filterOutings(places,{query:'雨の日'}).map(p=>p.id),['b']);
 assert.equal(filterOutings([{...places[0],name:'ＡＢＣ'}],{query:'abc'}).length,1);
});
test('combines status, category, type and numeric limits including zero',()=>{
 assert.deepEqual(filterOutings(places,{status:'unvisited'}).map(p=>p.id),['a','c']);
 assert.deepEqual(filterOutings(places,{status:'favorite',budget:'0',drive:'30'}).map(p=>p.id),['a']);
 assert.deepEqual(filterOutings(places,{status:'visited',type:'屋内',category:'博物館'}).map(p=>p.id),['b']);
 assert.equal(filterOutings(places,{budget:'0',type:'屋内'}).length,0);
 assert.deepEqual(filterOutings(places,{sort:'drive'}).map(p=>p.id),['a','b','c']);
 assert.deepEqual(filterOutings(places,{sort:'budget'}).map(p=>p.id),['a','b','c']);
 assert.equal(places[0].id,'a');
});
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.className='';this.textContent='';this.value='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(key,value){this.attributes[key]=value;}
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
const find=(node,cls)=>flatten(node).filter(el=>el.className.split(' ').includes(cls));
const counts=Object.fromEntries(['outingTotal','outingFavorites','outingUnvisited'].map(id=>[id,new Element('span')]));
globalThis.document={createElement:tag=>new Element(tag),getElementById:id=>counts[id]};
test('renders safe cards, preserves filters on refresh, resets and routes actions',async()=>{
 const root=new Element('div'),calls=[];
 const browser=createOutingBrowser(root,{map:p=>'https://example.com/map/'+p.id,route:p=>'https://example.com/route/'+p.id,update:async(...args)=>calls.push(args),weather:async p=>calls.push(['weather',p.id]),remove:async()=>{},error:()=>{},add:()=>calls.push(['add'])});
 browser.update([...places,{...places[0],id:'x',name:'<script>alert(1)</script>'}]);
 assert.equal(counts.outingTotal.textContent,'4');assert.equal(counts.outingFavorites.textContent,'2');
 assert.equal(find(root,'outing-place').length,4);
 assert.ok(find(root,'outing-place-name').some(node=>node.textContent==='<script>alert(1)</script>'));
 assert.ok(find(root,'outing-metrics')[0].children.some(node=>node.textContent==='無料'));
 const search=find(root,'outing-search')[0];search.value='雨の日';search.oninput();
 assert.equal(find(root,'outing-place').length,1);
 browser.update(places);assert.equal(find(root,'outing-place').length,1);
 await find(root,'outing-weather-link')[0].onclick();assert.deepEqual(calls[0],['weather','b']);
 await find(root,'outing-favorite')[0].onclick();assert.equal(calls[1][1],'favorite');assert.equal(calls[1][2],true);
 search.value='存在しない候補';search.oninput();assert.equal(find(root,'outing-place').length,0);
 await find(root,'outing-empty')[0].children[1].onclick();assert.equal(find(root,'outing-place').length,3);
 browser.update([]);await find(root,'outing-empty')[0].children[1].onclick();assert.deepEqual(calls.at(-1),['add']);
});
