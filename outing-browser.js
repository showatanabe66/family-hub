const normalized = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim();
export function filterOutings(items, filters = {}) {
  const terms=normalized(filters.query).split(/\s+/).filter(Boolean);
  const result=items.filter(place=>{
    const text=normalized([place.name,place.area,place.address,place.category,place.memo].join(' '));
    if(!terms.every(term=>text.includes(term)))return false;
    if(filters.status==='favorite' && !place.favorite)return false;
    if(filters.status==='unvisited' && place.visited)return false;
    if(filters.status==='visited' && !place.visited)return false;
    if(filters.petting && !place.petting)return false;
    if(filters.area && place.area!==filters.area)return false;
    if(filters.hideVisited && place.visited)return false;
    if(filters.type && place.type!==filters.type)return false;
    if(filters.category && place.category!==filters.category)return false;
    if(filters.drive!=='' && filters.drive!=null && (place.drive_minutes==null || Number(place.drive_minutes)>Number(filters.drive)))return false;
    if(filters.budget!=='' && filters.budget!=null && (place.budget_per_person==null || Number(place.budget_per_person)>Number(filters.budget)))return false;
    return true;
  });
  return result.sort((a,b)=>{
    if(filters.sort==='recommended')return (b.score??0)-(a.score??0)||(a.drive_minutes??Infinity)-(b.drive_minutes??Infinity)||a.name.localeCompare(b.name,'ja');
    if(filters.sort==='drive')return (a.drive_minutes??Infinity)-(b.drive_minutes??Infinity)||a.name.localeCompare(b.name,'ja');
    if(filters.sort==='budget')return (a.budget_per_person??Infinity)-(b.budget_per_person??Infinity)||a.name.localeCompare(b.name,'ja');
    return Number(!!b.favorite)-Number(!!a.favorite)||a.name.localeCompare(b.name,'ja');
  });
}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
export function createOutingBrowser(root, actions) {
  let items=[], filters={query:'',status:'all',type:'',category:'',drive:'',budget:'',sort:'recommended'};
  const search=el('input','outing-search');search.type='search';search.placeholder='施設名・エリア・メモで検索';search.setAttribute('aria-label','お出かけ先を検索');
  const chips=el('div','outing-filter-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','候補の状態');
  const chipButtons=[];
  for(const [value,label] of [['all','すべて'],['favorite','★ お気に入り'],['unvisited','行ってみたい'],['visited','訪問済み']]){
    const button=el('button','outing-filter-chip',label);button.type='button';button.onclick=()=>{filters.status=value;draw();};button.dataset.status=value;chipButtons.push(button);chips.append(button);
  }
  const advanced=el('details','outing-filter-details');advanced.append(el('summary','','条件で絞り込む'));
  const fields=el('div','outing-filter-fields');advanced.append(fields);
  const selects={};
  const quickFilters=el('div','outing-quick-filters');
  function chipGroup(field,options){const group=el('div','outing-filter-chips');group.setAttribute('role','group');group.setAttribute('aria-label',field==='category'?'カテゴリ':field==='type'?'屋内・屋外':'車での時間');for(const [value,label] of options){const b=el('button','outing-filter-chip',label);b.type='button';b.dataset.filter=field;b.dataset.value=value;b.onclick=()=>{filters[field]=value;if(selects[field])selects[field].value=value;draw();};group.append(b);}quickFilters.append(group);}
  chipGroup('category',[['','すべて'],...['動物・水族館','公園・自然','遊園地','学ぶ・体験','屋内あそび','水あそび'].map(x=>[x,x])]);
  chipGroup('type',[['','屋内・屋外すべて'],['屋内','屋内のみ'],['屋外','屋外のみ'],['両方','屋内・屋外両方']]);
  chipGroup('drive',[['','車ですべて'],['30','車で30分以内'],['60','車で60分以内'],['90','車で90分以内'],['120','車で120分以内']]);
  const toggles=el('div','outing-filter-chips');for(const [field,label] of [['petting','小動物ふれあいのみ'],['hideVisited','行った場所を隠す']]){const b=el('button','outing-filter-chip',label);b.type='button';b.dataset.toggle=field;b.onclick=()=>{filters[field]=!filters[field];draw();};toggles.append(b);}quickFilters.append(toggles);
  function select(field,label,options,parent=fields){
    const wrap=el('label','outing-select-label',label), input=el('select');input.setAttribute('aria-label',label);
    options.forEach(([value,text])=>{const option=el('option','',text);option.value=value;input.append(option);});
    input.value=filters[field];input.onchange=()=>{filters[field]=input.value;draw();};wrap.append(input);parent.append(wrap);selects[field]=input;return input;
  }
  select('type','屋内・屋外',[['','指定なし'],['屋内','屋内'],['屋外','屋外'],['両方','両方']]);
  select('category','カテゴリ',[['','指定なし']]);
  select('drive','車での移動時間',[['','指定なし'],['30','30分以内'],['60','60分以内'],['90','90分以内'],['120','120分以内']]);
  select('area','エリア',[['','すべて']]);
  select('budget','1人あたり予算',[['','指定なし'],['0','無料'],['1000','1,000円以内'],['3000','3,000円以内'],['5000','5,000円以内']]);
  const resultBar=el('div','outing-result-bar'), count=el('p','muted');count.setAttribute('role','status');
  resultBar.append(count);select('sort','並び順',[['recommended','天気・近さ順'],['favorite','お気に入り順'],['drive','近い順'],['budget','予算が低い順']],resultBar);
  const list=el('div','outing-cards');
  root.replaceChildren(search,quickFilters,chips,advanced,resultBar,list);
  search.oninput=()=>{filters.query=search.value;draw();};
  function button(label,className,action){
    const node=el('button',className,label);node.type='button';node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){actions.error(error.message||'操作できませんでした。');}finally{node.disabled=false;}};return node;
  }
  function card(place,index,recommended=false){
    const card=el('article','outing-place');card.id=`${recommended?'recommendation':'outing'}-${place.id}`;
    const visual=el('div',`outing-place-visual category-${place.type==='屋内'?'indoor':place.type==='両方'?'mixed':'outdoor'}`);visual.setAttribute('aria-hidden','true');visual.append(el('span','outing-card-number',String(index+1)),el('span','outing-place-symbol',place.category?.includes('動物')?'♧':place.type==='屋内'?'⌂':place.category?.includes('遊園地')?'☀':'❋'));
    if(place.photo?.url&&place.photo?.credit){try{const url=new URL(place.photo.url);if(url.protocol==='https:'){const img=el('img','outing-venue-photo');img.src=url.href;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();visual.prepend(img);}}catch{}}
    card.append(visual);
    const header=el('div','outing-place-heading');
    const text=el('div','outing-place-intro');text.append(el('p','outing-place-area',place.area||'エリア未登録'),el('h3','outing-place-name',place.name));
    const favorite=button(place.favorite?'★':'☆','outing-favorite',()=>actions.update(place,'favorite',!place.favorite));favorite.setAttribute('aria-label',`${place.name}の${place.favorite?'お気に入りを解除':'お気に入りに登録'}`);favorite.setAttribute('aria-pressed',String(!!place.favorite));
    header.append(text,favorite);
    const badges=el('div','outing-badges');
    if(place.petting)badges.append(el('span','outing-badge','小動物ふれあい'));
    if(place.type)badges.append(el('span','outing-badge',place.type));
    if(place.category)badges.append(el('span','outing-badge',place.category));
    if(place.albumCount)badges.append(el('span','outing-badge',`写真の記録 ${place.albumCount}件（この端末）`));
    if(place.visited)badges.append(el('span','outing-badge outing-visited-badge','訪問済み'));
    const metrics=el('div','outing-metrics');
    metrics.append(el('span','',place.drive_minutes==null?'移動時間未登録':`東戸塚から車で約${Math.round(place.drive_minutes/5)*5}分`),el('span','',place.budget_per_person==null?'予算未登録':Number(place.budget_per_person)===0?'無料':`¥${Number(place.budget_per_person).toLocaleString('ja-JP')} / 人`));
    card.append(header,badges,metrics);
    if(place.weather){const w=place.weather;card.append(el('p','outing-local-weather',`現地は${w.label} · ${w.high??'—'}℃ / ${w.low??'—'}℃ · 降水確率${w.precipProb==null?'提供なし':w.precipProb+'%'}`));}
    else card.append(el('p','outing-local-weather is-unknown',place.usesOriginWeather?'現地予報未取得 · 東戸塚の予報を参考にしています':'現地の天気予報は未取得です'));
    if(place.highlight||place.memo)card.append(el('p','outing-place-memo',place.highlight||place.memo));
    if(place.reasons){const reasons=el('ul','outing-reasons');place.reasons.forEach(reason=>reasons.append(el('li','',reason)));card.append(reasons);}
    // Opening times are shown only when a verified value is supplied.
    if(place.hoursSat||place.hoursSun)card.append(el('p','muted',`土曜 ${place.hoursSat||'未確認'} / 日曜 ${place.hoursSun||'未確認'}`));
    const visit=button(place.albumCount?'✓ アルバムに記録あり':place.visited?'✓ 行った':'✓ 行ったを記録','outing-visit',()=>actions.update(place,'visited',!(place.manualVisited??place.visited)));visit.setAttribute('aria-pressed',String(!!place.visited));visit.disabled=!!place.albumCount;card.append(visit);
    const links=el('div','outing-place-links');
    for(const [label,url] of [['地図',actions.map(place)],['車のルート',actions.route(place)]]){
      const link=el('a','',label);link.href=url;link.target='_blank';link.rel='noopener';links.append(link);
    }
    links.append(button('天気を見る','outing-weather-link',()=>actions.weather(place)));
    if(actions.record)links.append(button("写真で記録","outing-weather-link",()=>actions.record(place)));
    if(actions.album)links.append(button("アルバムを見る","outing-weather-link",()=>actions.album(place)));
    card.append(links);
    const more=el('details','outing-place-more');more.append(el('summary','','訪問の記録・詳細'));
    if(place.catalogOnly)more.append(el('p','muted',place.source));
    if(place.website){try{const url=new URL(place.website);if(url.protocol==='https:'){const official=el('a','','公式サイト ↗');official.href=url.href;official.target='_blank';official.rel='noopener';links.append(official);}}catch{}}
    if(place.photo?.credit)more.append(el('p','muted',`写真：${place.photo.credit}`));
    if(place.hoursSat==null&&place.hoursSun==null)more.append(el('p','muted','営業時間・休業日・料金は未確認です。施設の公式情報をご確認ください。'));
    if(place.rating!=null)more.append(el('p','muted',`口コミ評価 ${place.rating}${place.ratingCount!=null?'（'+place.ratingCount+'件）':''}`));
    if(place.address)more.append(el('p','muted',place.address));
    const controls=el('div','outing-place-controls');
    controls.append(button(place.albumCount?'訪問の手動設定を切り替える':place.visited?'未訪問に戻す':'訪問済みにする','secondary',()=>actions.update(place,'visited',!(place.manualVisited??place.visited))),...(!place.catalogOnly?[button('候補を削除','outing-delete',()=>actions.remove(place))]:[]));
    more.append(controls);card.append(more);return card;
  }
  function draw(){
    quickFilters.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(String(filters[b.dataset.filter]??'')===b.dataset.value)));
    quickFilters.querySelectorAll('[data-toggle]').forEach(b=>b.setAttribute('aria-pressed',String(!!filters[b.dataset.toggle])));
    chipButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.status===filters.status)));
    const filtered=filterOutings(items,filters);count.textContent=`${filtered.length}件表示 / 全${items.length}件`;
    list.replaceChildren();
    if(!filtered.length){
      const empty=el('div','outing-empty');empty.append(el('p','',items.length?'条件に合うお出かけ先がありません。':'次のお出かけ先を、家族の候補に。'));
      empty.append(button(items.length?'絞り込みをリセット':'＋ 候補を追加','secondary',()=>{
        if(!items.length){actions.add();return;}
        filters={query:'',status:'all',type:'',category:'',drive:'',budget:'',sort:'recommended'};search.value='';Object.entries(selects).forEach(([field,input])=>input.value=filters[field]);draw();
      }));list.append(empty);
    }
    filtered.forEach((place,index)=>list.append(card(place,index)));
    const recommended=document.getElementById('outingRecommended');
    if(recommended){recommended.replaceChildren(...filtered.slice(0,3).map((p,i)=>card(p,i,true)));if(!filtered.length)recommended.append(el('p','muted','条件に合うスポットがありません。絞り込みを変更してください。'));}
    const title=document.getElementById('outingRecommendedTitle');if(title)title.textContent=`${document.querySelector('#outingDates [aria-pressed="true"]')?.getAttribute('aria-label')||'今日'}のおすすめ`;
    actions.draw?.(filtered);
  }
  return {update(nextItems){
    items=nextItems;
    const category=selects.category;category.replaceChildren();
    [['','指定なし'],...[...new Set(items.map(place=>place.category).filter(Boolean))].sort().map(value=>[value,value])].forEach(([value,label])=>{const option=el('option','',label);option.value=value;category.append(option);});
    if(!items.some(place=>place.category===filters.category))filters.category='';category.value=filters.category;
    const area=selects.area;area.replaceChildren();[['','すべて'],...[...new Set(items.map(p=>p.area).filter(Boolean))].sort().map(x=>[x,x])].forEach(([value,text])=>{const o=el('option','',text);o.value=value;area.append(o);});area.value=filters.area||'';
    document.getElementById('outingTotal').textContent=String(items.length);
    document.getElementById('outingFavorites').textContent=String(items.filter(place=>place.favorite).length);
    document.getElementById('outingUnvisited').textContent=String(items.filter(place=>!place.visited).length);
    draw();
  }};
}

