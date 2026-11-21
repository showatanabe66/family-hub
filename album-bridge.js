// Album runs inside the Hub tab; messages are restricted to the same origin/frame.
export function createAlbumBridge(frame, onCounts, cloud) {
  let owner=null, places=[], counts={}, pending=null;
  const send=()=>{if(owner)frame.contentWindow?.postMessage({type:'family-album-context',places,active:document.querySelector('[data-view="album"]')?.getAttribute('aria-pressed')==='true'},location.origin);};
  function open(place, mode='new') {
    document.querySelector('[data-view="album"]').click();
    pending={type:'family-album-open',id:`outing:${place.id}`,mode};
    send();frame.contentWindow?.postMessage(pending,location.origin);
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||!owner)return;
    const data=event.data;
    if(data?.type==='family-album-request'&&cloud&&data.owner===owner&&typeof data.id==='string'){
      const requestOwner=owner;
      Promise.resolve().then(()=>cloud.request(requestOwner,data.method,data.payload)).then(result=>{
        if(owner===requestOwner)frame.contentWindow?.postMessage({type:'family-album-response',owner:requestOwner,id:data.id,result},location.origin);
      }).catch(error=>{if(owner===requestOwner)frame.contentWindow?.postMessage({type:'family-album-response',owner:requestOwner,id:data.id,error:error.message||'同期に失敗しました。'},location.origin);});
      return;
    }
    if(data?.type==='family-album-ready'){send();if(pending)frame.contentWindow.postMessage(pending,location.origin);}
    if(data?.type==='family-album-height'&&Number.isFinite(data.height))frame.style.height=`${Math.max(650,Math.min(30000,data.height))}px`;
    if(data?.type==='family-album-counts'&&data.counts&&typeof data.counts==='object'){
      counts=Object.fromEntries(Object.entries(data.counts).filter(([id,count])=>id.startsWith('outing:')&&Number.isInteger(count)&&count>0));onCounts(counts);
    }
    if(data?.type==='family-album-opened')pending=null;
  });
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-view]'))queueMicrotask(send);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')send();});
  return {open, setPlaces(next){places=next;send();},setOwner(id){
    if(owner===id)return;owner=id;places=[];counts={};pending=null;onCounts(counts);
    if(!owner){frame.removeAttribute('src');frame.src='about:blank';return;}
    frame.src=`./album/index.html?owner=${encodeURIComponent(owner)}`;
  }};
}
export function withAlbumVisits(places, counts){return places.map(place=>({...place,manualVisited:!!place.visited,albumCount:counts[`outing:${place.id}`]||0,visited:!!place.visited||!!counts[`outing:${place.id}`]}));}
