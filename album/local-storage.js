// 保存方式を変更する場合は、このモジュールの公開APIを置き換える。
let database;
function requestResult(request) { return new Promise((resolve,reject)=> {request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);}); }
async function db() {
  if (!database) database = new Promise((resolve,reject)=> {
    const req=indexedDB.open('family-hub-album:'+new URLSearchParams(location.search).get('owner'),1);
    req.onupgradeneeded=()=> {req.result.createObjectStore('records',{keyPath:'id'});req.result.createObjectStore('photos');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>{database=null;reject(req.error);};
    req.onblocked=()=>{database=null;reject(new Error('他のタブを閉じてから再読み込みしてください。'));};
  });
  return database;
}
export async function listRecords(){return requestResult((await db()).transaction('records').objectStore('records').getAll());}
export async function getPhoto(path){return requestResult((await db()).transaction('photos').objectStore('photos').get(path));}
function complete(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存を中断しました'));});}
export async function saveRecord(record,photo){
  const tx=(await db()).transaction(['records','photos'],'readwrite');const done=complete(tx);
  if(photo)tx.objectStore('photos').put(photo,record.photoPath);
  tx.objectStore('records').put(record);await done;
}
export async function deleteRecord(record){const tx=(await db()).transaction(['records','photos'],'readwrite');const done=complete(tx);tx.objectStore('records').delete(record.id);tx.objectStore('photos').delete(record.photoPath);await done;}
