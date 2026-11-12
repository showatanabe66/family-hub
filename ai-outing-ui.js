function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function link(label,value){try{const url=new URL(value);if(url.protocol!=='https:')return null;const node=el('a','',label);node.href=url.toString();node.target='_blank';node.rel='noopener';return node;}catch{return null;}}
export function dateLimits(now=new Date()){
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(now);
  const end=new Date(`${today}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+15);
  return {min:today,max:end.toISOString().slice(0,10)};
}
export function renderAiRecommendations(root,data,onSave){
  root.replaceChildren();
  const forecast=data.origin_weather;
  const summary=el('div','ai-outing-summary');
  summary.append(el('strong','',`${data.date} · 東戸塚発 · 4歳・6歳向け`),el('p','',`東戸塚の予報：${forecast.label} ／ 降水確率${forecast.precipitation_probability}%${forecast.temperature_max==null?'':` ／ 最高${forecast.temperature_max}℃`}`),el('span','ai-weather-policy',forecast.indoor_only?'屋内で楽しめる場所を検索':'屋内・屋外から検索'));
  root.append(summary,el('p','muted',data.message));
  for(const [index,place] of data.recommendations.entries()){
    const card=el('article','ai-outing-card');
    const head=el('div','ai-outing-heading');head.append(el('span','ai-outing-rank',String(index+1)),el('h3','',place.name));card.append(head);
    const badges=el('div','outing-badges');
    [place.type,`車で約${place.drive_minutes}分`,place.budget_per_person===null?'料金は施設情報で確認':place.budget_per_person===0?'無料':`予算目安 ¥${place.budget_per_person.toLocaleString('ja-JP')} / 人`].forEach(text=>badges.append(el('span','outing-badge',text)));card.append(badges);
    card.append(el('p','ai-child-reason',place.child_reason));
    const weather=place.weather;card.append(el('p','ai-place-weather',`${data.date}の現地予報：${weather.label} ／ 降水確率${weather.precipitation_probability}%`),el('p','muted',place.weather_reason));
    if(place.indoor_plan)card.append(el('p','muted',`屋内の楽しみ方：${place.indoor_plan}`));
    if(place.age_notes)card.append(el('p','muted',`年齢・利用条件：${place.age_notes}`));
    card.append(el('p','muted',`営業・予約：${place.opening_notes||'最新情報を施設ページで確認してください。'}`));
    const links=el('div','outing-place-links');
    const route=new URL('https://www.google.com/maps/dir/');route.search=new URLSearchParams({api:'1',origin:'東戸塚駅',destination:place.address||place.name,travelmode:'driving'});
    for(const [label,url] of [['施設ページ',place.official_url],['車のルート',route.toString()]]){const node=link(label,url);if(node)links.append(node);}card.append(links);
    const sources=el('details','ai-sources');sources.append(el('summary','','検索で参照した情報'));
    for(const source of place.sources){const node=link(source.title,source.url);if(node)sources.append(node);}card.append(sources);
    const status=el('p','muted');status.setAttribute('role','status');
    const save=el('button','secondary','＋ 家族の候補に保存');save.type='button';
    save.onclick=async()=>{save.disabled=true;try{status.textContent=await onSave(place);save.textContent='候補に保存済み';}catch(error){status.textContent=error.message;save.disabled=false;}};
    card.append(save,status);root.append(card);
  }
  root.append(el('p','muted ai-evidence-note',data.travel_note),el('p','muted ai-evidence-note',data.weather_note));
  const checked=new Date(data.checked_at);
  root.append(el('p','muted ai-checked-time',`確認：${checked.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}${data.cached?'（直近の検索結果を再表示）':''}`));
}
