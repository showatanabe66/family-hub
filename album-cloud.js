const BUCKET='family-album';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message)=>{throw new Error(message);};
export function toAlbumRecord(row){return {id:row.id,spotId:row.spot_id,placeName:row.place_name,visitedDate:row.visited_date,comment:row.comment,photoPath:row.photo_path,createdAt:row.created_at,updatedAt:row.updated_at,version:row.version,deleted:!!row.deleted_at};}
export function createAlbumCloudStore(client){
 async function checkOwner(owner){const {data,error}=await client.auth.getSession();if(error||!owner||data?.session?.user?.id!==owner)fail('ログイン状態が変わりました。Family Hubにログインし直してください。');}
 function validPath(owner,path){return typeof path==='string'&&path.startsWith(`${owner}/`)&&!path.includes('..');}
 async function find(owner,id){const {data,error}=await client.from('album_records').select('*').eq('owner_id',owner).eq('id',id).maybeSingle();if(error)fail('記録を確認できません。通信状態を確認して再実行してください。');return data;}
 async function removePhotos(owner,paths){const safe=paths.filter(p=>validPath(owner,p));if(!safe.length)return;await checkOwner(owner);const {error}=await client.storage.from(BUCKET).remove(safe);if(error)fail('写真の削除を完了できませんでした。同期を更新すると再試行します。');}
 async function list(owner){await checkOwner(owner);const rows=[];for(let offset=0;;offset+=500){const {data,error}=await client.from('album_records').select('*').eq('owner_id',owner).order('id').range(offset,offset+499);if(error)fail('アルバムを同期できません。通信状態を確認し「同期を更新」を押してください。');rows.push(...data);if(data.length<500)break;}
  await checkOwner(owner);const retired=rows.filter(r=>r.deleted_at).map(r=>r.photo_path);if(retired.length)try{await removePhotos(owner,retired);}catch{/* Tombstones remain so a later refresh can retry deletion. */}
  return rows.filter(r=>!r.deleted_at).map(toAlbumRecord);
 }
 async function photo(owner,path){await checkOwner(owner);if(!validPath(owner,path))fail('この写真にはアクセスできません。');const {data,error}=await client.storage.from(BUCKET).download(path);await checkOwner(owner);if(error)fail('写真を読み込めませんでした。同期を更新してください。');return data;}
 async function save(owner,record,image,migration=false){
  await checkOwner(owner);if(!UUID.test(record?.id||''))fail('記録のIDを読み取れません。元の記録は端末に残しています。');
  const existing=await find(owner,record.id);
  // An import never overwrites a record already edited or deleted on another device.
  if(migration&&existing)return {record:toAlbumRecord(existing),skipped:true};
  if(existing?.deleted_at)fail('別の端末で削除された記録です。同期を更新してください。');
  if(existing&&record.version==null)return {record:toAlbumRecord(existing),skipped:true};
  if(existing&&existing.version!==record.version)fail('別の端末で更新されています。画面を開き直してから編集してください。');
  if(record.version!=null&&!existing)fail('この記録を確認できません。同期を更新してください。');
  const name=String(record.placeName||'').trim(),comment=String(record.comment||'').trim();
  if(!name||name.length>200||!comment||comment.length>2000||!/^\d{4}-\d{2}-\d{2}$/.test(record.visitedDate||''))fail('場所・訪問日・コメントを確認してください。');
  let path=existing?.photo_path;
  if(image){if(!(image instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>15728640||image.size===0)fail('写真は15MB以下のJPEG・PNG・WebPを選択してください。');path=`${owner}/${record.id}/${crypto.randomUUID()}.${{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[image.type]}`;await checkOwner(owner);const {error}=await client.storage.from(BUCKET).upload(path,image,{contentType:image.type,upsert:false,cacheControl:'3600'});if(error)fail('写真をアップロードできませんでした。元の写真は端末に残っています。');}
  if(!path)fail('同期する写真が見つかりません。元の端末で写真を選び直してください。');
  await checkOwner(owner);const stamp=new Date().toISOString();const row={owner_id:owner,id:record.id,spot_id:record.spotId||null,place_name:name,visited_date:record.visitedDate,comment,photo_path:path,updated_at:stamp,version:(existing?.version||0)+1};
  if(!existing)row.created_at=Number.isFinite(Date.parse(record.createdAt))?record.createdAt:stamp;
  const query=existing?client.from('album_records').update(row).eq('owner_id',owner).eq('id',record.id).eq('version',record.version).is('deleted_at',null):client.from('album_records').insert(row);
  const {data,error}=await query.select('*').maybeSingle();
  // Do not remove an uploaded file on an ambiguous network error: the DB commit may have succeeded.
  if(error)fail('保存の完了を確認できません。同期を更新して確認してください。入力内容と端末内の記録は残しています。');
  if(!data)fail('別の端末で更新されました。画面を開き直してから編集してください。');
  await checkOwner(owner);if(existing?.photo_path!==path&&existing?.photo_path)try{await removePhotos(owner,[existing.photo_path]);}catch{/* The new record and photo are already committed. */}
  return {record:toAlbumRecord(data),skipped:false};
 }
 async function remove(owner,record){await checkOwner(owner);const existing=await find(owner,record.id);if(!existing)return;let row=existing;if(!existing.deleted_at){const {data,error}=await client.from('album_records').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString(),version:existing.version+1}).eq('owner_id',owner).eq('id',record.id).eq('version',record.version).is('deleted_at',null).select('*').maybeSingle();if(error||!data)fail('別の端末で更新されたか、削除に失敗しました。同期を更新してください。');row=data;}await removePhotos(owner,[row.photo_path]);return {deleted:true};}
 return {async request(owner,method,payload={}){if(method==='list')return list(owner);if(method==='photo')return photo(owner,payload.path);if(method==='save')return save(owner,payload.record,payload.photo,!!payload.migration);if(method==='delete')return remove(owner,payload.record);fail('この操作には対応していません。');}};
}
