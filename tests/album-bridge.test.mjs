import test from 'node:test';
import assert from 'node:assert/strict';
import {createAlbumBridge,withAlbumVisits} from '../album-bridge.js';
test('local photo records add visited status without mutating manual visit data',()=>{
 const places=[{id:1,name:'A',visited:false},{id:2,name:'B',visited:true}];
 const next=withAlbumVisits(places,{'outing:1':2});
 assert.equal(next[0].visited,true);assert.equal(next[0].albumCount,2);assert.equal(next[0].manualVisited,false);
 assert.equal(places[0].visited,false);
 assert.equal(withAlbumVisits(places,{})[0].visited,false);
 assert.equal(withAlbumVisits(places,{})[1].visited,true);
});
test('bridge scopes messages to the album frame and clears the frame on logout',()=>{
 let handler;globalThis.window={addEventListener:(_,fn)=>handler=fn};globalThis.location={origin:'https://example.com'};
 let clicked=0;globalThis.document={addEventListener:()=>{},querySelector:()=>({click:()=>clicked++,getAttribute:()=>"false"})};
 const messages=[],updates=[],frame={style:{},contentWindow:{postMessage:(...args)=>messages.push(args)},removeAttribute:()=>{}};
 const bridge=createAlbumBridge(frame,counts=>updates.push(counts));
 bridge.setOwner('user-1');assert.equal(frame.src,'./album/index.html?owner=user-1');
 bridge.setPlaces([{id:42,name:'A'}]);bridge.open({id:42},'spot');assert.equal(clicked,1);
 assert.ok(messages.some(([data])=>data.type==='family-album-open'&&data.id==='outing:42'));
 const count=updates.length;
 handler({origin:'https://evil.test',source:frame.contentWindow,data:{type:'family-album-counts',counts:{'outing:42':1}}});assert.equal(updates.length,count);
 handler({origin:location.origin,source:{},data:{type:'family-album-counts',counts:{'outing:42':1}}});assert.equal(updates.length,count);
 handler({origin:location.origin,source:frame.contentWindow,data:{type:'family-album-counts',counts:{'outing:42':1,'outing:bad':-3,'other':4}}});assert.deepEqual(updates.at(-1),{'outing:42':1});
 bridge.setOwner(null);assert.equal(frame.src,'about:blank');assert.deepEqual(updates.at(-1),{});
 handler({origin:location.origin,source:frame.contentWindow,data:{type:'family-album-counts',counts:{'outing:42':1}}});assert.deepEqual(updates.at(-1),{});
 bridge.setOwner('user-2');assert.equal(frame.src,'./album/index.html?owner=user-2');
});
test('cloud RPC rejects other frames/accounts and drops late replies after logout',async()=>{
 let handler;globalThis.window={addEventListener:(_,fn)=>handler=fn};globalThis.location={origin:'https://example.com'};globalThis.document={addEventListener:()=>{},querySelector:()=>({getAttribute:()=> 'false'})};
 const messages=[],calls=[];let finish;const cloud={request:(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve);}};
 const frame={style:{},contentWindow:{postMessage:data=>messages.push(data)},removeAttribute:()=>{}};const bridge=createAlbumBridge(frame,()=>{},cloud);bridge.setOwner('one');
 const request={type:'family-album-request',owner:'one',id:'request-1',method:'list',payload:{}};
 handler({origin:location.origin,source:{},data:request});handler({origin:location.origin,source:frame.contentWindow,data:{...request,owner:'two'}});await Promise.resolve();assert.equal(calls.length,0);
 handler({origin:location.origin,source:frame.contentWindow,data:request});await Promise.resolve();assert.equal(calls[0][0],'one');bridge.setOwner(null);finish([{id:'private'}]);await new Promise(resolve=>setTimeout(resolve,0));assert.ok(!messages.some(m=>m.type==='family-album-response'));
});
