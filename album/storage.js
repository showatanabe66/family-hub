import * as local from './local-storage.js';
const owner=new URLSearchParams(location.search).get('owner');
const waiting=new Map();
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='family-album-response'||event.data.owner!==owner)return;
 const task=waiting.get(event.data.id);if(!task)return;waiting.delete(event.data.id);clearTimeout(task.timeout);event.data.error?task.reject(new Error(event.data.error)):task.resolve(event.data.result);
});
function request(method,payload={}){return new Promise((resolve,reject)=>{if(parent===window||!owner){reject(new Error('Family Hubのアルバムタブから開いてください。'));return;}const id=crypto.randomUUID();const timeout=setTimeout(()=>{waiting.delete(id);reject(new Error('同期の応答を確認できません。通信状態を確認し、同期を更新してください。'));},120000);waiting.set(id,{resolve,reject,timeout});parent.postMessage({type:'family-album-request',owner,id,method,payload},location.origin);});}
export const listRecords=()=>request('list');
export const getPhoto=path=>request('photo',{path});
export const saveRecord=(record,photo)=>request('save',{record,photo});
export const deleteRecord=record=>request('delete',{record});
export async function localRecordCount(){return (await local.listRecords()).filter(r=>!r.cloudMigrated).length;}
export async function migrateLocalRecords(onProgress=()=>{}){
 const records=(await local.listRecords()).filter(r=>!r.cloudMigrated);let done=0;
 for(const record of records){const photo=await local.getPhoto(record.photoPath);await request('save',{record,photo,migration:true});await local.saveRecord({...record,cloudMigrated:true});onProgress(++done,records.length);}
 return done;
}
