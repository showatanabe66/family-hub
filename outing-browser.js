const normalized = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim();
export function filterOutings(items, filters = {}) {
  const terms=normalized(filters.query).split(/\s+/).filter(Boolean);
  const result=items.filter(place=>{
    const text=normalized([place.name,place.area,place.address,place.category,place.memo].join(' '));
    if(!terms.every(term=>text.includes(term)))return false;
    if(filters.status==='favorite' && !place.favorite)return false;
    if(filters.status==='unvisited' && place.visited)return false;
    if(filters.status==='visited' && !place.visited)return false;
    if(filters.type && place.type!==filters.type)return false;
    if(filters.category && place.category!==filters.category)return false;
    if(filters.drive!=='' && filters.drive!=null && (place.drive_minutes==null || Number(place.drive_minutes)>Number(filters.drive)))return false;
    if(filters.budget!=='' && filters.budget!=null && (place.budget_per_person==null || Number(place.budget_per_person)>Number(filters.budget)))return false;
    return true;
  });
  return result.sort((a,b)=>{
    if(filters.sort==='drive')return (a.drive_minutes??Infinity)-(b.drive_minutes??Infinity)||a.name.localeCompare(b.name,'ja');
    if(filters.sort==='budget')return (a.budget_per_person??Infinity)-(b.budget_per_person??Infinity)||a.name.localeCompare(b.name,'ja');
    return Number(!!b.favorite)-Number(!!a.favorite)||a.name.localeCompare(b.name,'ja');
  });
}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
export function createOutingBrowser(root, actions) {
  let items=[], filters={query:'',status:'all',type:'',category:'',drive:'',budget:'',sort:'favorite'};
  const search=el('input','outing-search');search.type='search';search.placeholder='施設名・エリア・メモで検索';search.setAttribute('aria-label','お出かけ先を検索');
  const chips=el('div','outing-filter-chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','候補の状態');
  const chipButtons=[];
  for(const [value,label] of [['all','すべて'],['favorite','★ お気に入り'],['unvisited','行ってみたい'],['visited','訪問済み']]){
    const button=el('button','outing-filter-chip',label);button.type='button';button.onclick=()=>{filters.status=value;draw();};button.dataset.status=value;chipButtons.push(button);chips.append(button);
  }
  const advanced=el('details','outing-filter-details');advanced.append(el('summary','','条件で絞り込む'));
  const fields=el('div','outing-filter-fields');advanced.append(fields);
  const selects={};
  function select(field,label,options,parent=fields){
    const wrap=el('label','outing-select-label',label), input=el('select');input.setAttribute('aria-label',label);
    options.forEach(([value,text])=>{const option=el('option','',text);option.value=value;input.append(option);});
    input.value=filters[field];input.onchange=()=>{filters[field]=input.value;draw();};wrap.append(input);parent.append(wrap);selects[field]=input;return input;
  }
  select('type','屋内・屋外',[['','指定なし'],['屋内','屋内'],['屋外','屋外'],['両方','両方']]);
  select('category','カテゴリ',[['','指定なし']]);
  select('drive','車での移動時間',[['','指定なし'],['30','30分以内'],['60','60分以内'],['120','120分以内']]);
  select('budget','1人あたり予算',[['','指定なし'],['0','無料'],['1000','1,000円以内'],['3000','3,000円以内'],['5000','5,000円以内']]);
  const resultBar=el('div','outing-result-bar'), count=el('p','muted');count.setAttribute('role','status');
  resultBar.append(count);select('sort','並び順',[['favorite','お気に入り順'],['drive','近い順'],['budget','予算が低い順']],resultBar);
  const list=el('div','outing-cards');
  root.replaceChildren(search,chips,advanced,resultBar,list);
  search.oninput=()=>{filters.query=search.value;draw();};
  function button(label,className,action){
    const node=el('button',className,label);node.type='button';node.onclick=async()=>{node.disabled=true;try{await action();}catch(error){actions.error(error.message||'操作できませんでした。');}finally{node.disabled=false;}};return node;
  }
  function card(place){
    const card=el('article','outing-place');
    const header=el('div','outing-place-heading');
    const text=el('div','outing-place-intro');text.append(el('p','outing-place-area',place.area||'エリア未登録'),el('h3','outing-place-name',place.name));
    const favorite=button(place.favorite?'★':'☆','outing-favorite',()=>actions.update(place,'favorite',!place.favorite));favorite.setAttribute('aria-label',`${place.name}の${place.favorite?'お気に入りを解除':'お気に入りに登録'}`);favorite.setAttribute('aria-pressed',String(!!place.favorite));
    header.append(text,favorite);
    const badges=el('div','outing-badges');
    if(place.type)badges.append(el('span','outing-badge',place.type));
    if(place.category)badges.append(el('span','outing-badge',place.category));
    if(place.visited)badges.append(el('span','outing-badge outing-visited-badge','訪問済み'));
    const metrics=el('div','outing-metrics');
    metrics.append(el('span','',place.drive_minutes==null?'移動時間未登録':`車で${place.drive_minutes}分`),el('span','',place.budget_per_person==null?'予算未登録':Number(place.budget_per_person)===0?'無料':`¥${Number(place.budget_per_person).toLocaleString('ja-JP')} / 人`));
    card.append(header,badges,metrics);
    if(place.memo)card.append(el('p','outing-place-memo',place.memo));
    const links=el('div','outing-place-links');
    for(const [label,url] of [['地図',actions.map(place)],['車のルート',actions.route(place)]]){
      const link=el('a','',label);link.href=url;link.target='_blank';link.rel='noopener';links.append(link);
    }
    links.append(button('天気を見る','outing-weather-link',()=>actions.weather(place)));
    card.append(links);
    const more=el('details','outing-place-more');more.append(el('summary','','訪問の記録・詳細'));
    if(place.address)more.append(el('p','muted',place.address));
    const controls=el('div','outing-place-controls');
    controls.append(button(place.visited?'未訪問に戻す':'訪問済みにする','secondary',()=>actions.update(place,'visited',!place.visited)),button('候補を削除','outing-delete',()=>actions.remove(place)));
    more.append(controls);card.append(more);return card;
  }
  function draw(){
    chipButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.status===filters.status)));
    const filtered=filterOutings(items,filters);count.textContent=`${filtered.length}件表示 / 全${items.length}件`;
    list.replaceChildren();
    if(!filtered.length){
      const empty=el('div','outing-empty');empty.append(el('p','',items.length?'条件に合うお出かけ先がありません。':'次のお出かけ先を、家族の候補に。'));
      empty.append(button(items.length?'絞り込みをリセット':'＋ 候補を追加','secondary',()=>{
        if(!items.length){actions.add();return;}
        filters={query:'',status:'all',type:'',category:'',drive:'',budget:'',sort:'favorite'};search.value='';Object.entries(selects).forEach(([field,input])=>input.value=filters[field]);draw();
      }));list.append(empty);
    }
    filtered.forEach(place=>list.append(card(place)));
  }
  draw();
  return {update(nextItems){
    items=nextItems;
    const category=selects.category;category.replaceChildren();
    [['','指定なし'],...[...new Set(items.map(place=>place.category).filter(Boolean))].sort().map(value=>[value,value])].forEach(([value,label])=>{const option=el('option','',label);option.value=value;category.append(option);});
    if(!items.some(place=>place.category===filters.category))filters.category='';category.value=filters.category;
    document.getElementById('outingTotal').textContent=String(items.length);
    document.getElementById('outingFavorites').textContent=String(items.filter(place=>place.favorite).length);
    document.getElementById('outingUnvisited').textContent=String(items.filter(place=>!place.visited).length);
    draw();
  }};
}
