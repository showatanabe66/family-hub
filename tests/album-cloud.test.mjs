import test from 'node:test';import assert from 'node:assert/strict';
import {createAlbumCloudStore} from '../album-cloud.js';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function backend(){const rows=new Map(),files=new Map();let uploadFails=false,writeFails=false;
 function client(user){
  class Query{
   constructor(){this.filters=[];this.op='select';this.bounds=null;}
   select(){return this;}order(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}is(k,v){this.filters.push(r=>(r[k]??null)===v);return this;}range(a,b){this.bounds=[a,b];return this;}
   insert(row){this.op='insert';this.row=row;return this;}update(row){this.op='update';this.row=row;return this;}
   async result(){if(writeFails&&this.op!=='select')return {error:{message:'offline'}};let matches=[...rows.values()].filter(r=>r.owner_id===user&&this.filters.every(f=>f(r)));
    if(this.op==='insert'){const key=this.row.owner_id+this.row.id;if(rows.has(key))return {error:{code:'23505'}};const row={...this.row,deleted_at:null};rows.set(key,row);matches=[row];}
    if(this.op==='update'){matches=matches.map(r=>({...r,...this.row}));matches.forEach(r=>rows.set(r.owner_id+r.id,r));}
    if(this.bounds)matches=matches.slice(this.bounds[0],this.bounds[1]+1);return {data:structuredClone(matches),error:null};
   }
   async maybeSingle(){const r=await this.result();return {...r,data:r.data?.[0]??null};}
   then(resolve,reject){return this.result().then(resolve,reject);}
  }
  return {auth:{getSession:async()=>({data:{session:user?{user:{id:user}}:null}})},from:()=>new Query(),storage:{from:bucket=>{assert.equal(bucket,'family-album');return {upload:async(path,blob,options)=>{assert.equal(options.upsert,false);if(uploadFails)return {error:{message:'offline'}};files.set(path,blob);return {error:null};},download:async path=>path.startsWith(user+'/')&&files.has(path)?{data:files.get(path),error:null}:{error:{message:'private'}},remove:async paths=>{paths.forEach(p=>files.delete(p));return {error:null};}};}}};
 }
 return {client,rows,files,failUpload(value){uploadFails=value;},failWrite(value){writeFails=value;}};
}
const record={id,spotId:'outing:zoorasia',placeName:'ズーラシア',visitedDate:'2026-11-21',comment:'家族でお出かけ',createdAt:'2026-11-21T01:00:00Z'};
const photo=()=>new Blob(['image'],{type:'image/png'});
test('two devices share create/edit/photo replacement/delete and old backups cannot resurrect deletions',async()=>{
 const b=backend(),a=createAlbumCloudStore(b.client(owner)),second=createAlbumCloudStore(b.client(owner));
 const saved=await a.request(owner,'save',{record,photo:photo()});assert.equal(saved.record.version,1);
 await assert.rejects(a.request(owner,'save',{record,photo:photo()}),/すでに保存されています/);assert.equal(b.rows.size,1);
 let list=await second.request(owner,'list');assert.equal(list.length,1);assert.equal(await (await second.request(owner,'photo',{path:list[0].photoPath})).text(),'image');
 const changed=await second.request(owner,'save',{record:{...list[0],comment:'別端末から編集'},photo:photo()});assert.equal(changed.record.version,2);assert.equal(b.files.size,1);
 await assert.rejects(a.request(owner,'save',{record:saved.record,photo:photo()}),/別の端末で更新/);
 await a.request(owner,'delete',{record:changed.record});assert.equal((await second.request(owner,'list')).length,0);assert.equal(b.files.size,0);
 const imported=await second.request(owner,'save',{record,photo:photo(),migration:true});assert.equal(imported.skipped,true);assert.equal(imported.record.deleted,true);assert.equal(b.files.size,0);
});
test('account separation, signed out operations, immutable uploads, and import retries',async()=>{
 const b=backend(),a=createAlbumCloudStore(b.client(owner)),otherStore=createAlbumCloudStore(b.client(other));
 await a.request(owner,'save',{record,photo:photo(),migration:true});await a.request(owner,'save',{record,photo:photo(),migration:true});assert.equal(b.rows.size,1);assert.equal(b.files.size,1);
 assert.equal((await otherStore.request(other,'list')).length,0);const path=[...b.files.keys()][0];await assert.rejects(otherStore.request(other,'photo',{path}),/アクセスできません/);
 await assert.rejects(otherStore.request(owner,'list'),/ログイン状態/);await assert.rejects(createAlbumCloudStore(b.client(null)).request(owner,'list'),/ログイン状態/);
});
test('upload failure does not create a record and ambiguous DB failures preserve uploaded photos',async()=>{
 const b=backend(),a=createAlbumCloudStore(b.client(owner));b.failUpload(true);await assert.rejects(a.request(owner,'save',{record,photo:photo()}),/アップロード/);assert.equal(b.rows.size,0);assert.equal(b.files.size,0);
 b.failUpload(false);b.failWrite(true);await assert.rejects(a.request(owner,'save',{record,photo:photo()}),/完了を確認できません/);assert.equal(b.rows.size,0);assert.equal(b.files.size,1);
});
