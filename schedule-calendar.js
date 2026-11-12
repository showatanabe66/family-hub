export function tokyoToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo'}).format(now);
}
function key(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function monthCells(year, month) {
  const first = new Date(Date.UTC(year,month,1));
  const count = new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const length = Math.ceil((first.getUTCDay()+count)/7)*7;
  return Array.from({length},(_,index)=>{
    const date = new Date(Date.UTC(year,month,index-first.getUTCDay()+1));
    return {date:key(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()), day:date.getUTCDate(), inMonth:date.getUTCMonth()===month};
  });
}
function sourceName(item) { return item.imported ? item.source_name || '同期した予定' : item.person || '家族全員'; }
function tone(name) { return [...name].reduce((hash,c)=>(hash+c.codePointAt(0))%5,0); }
function element(tag, className, text) {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=text;
  return node;
}
export function createScheduleCalendar(root, renderItem) {
  let today=tokyoToday(), selected=today, year=Number(today.slice(0,4)), month=Number(today.slice(5,7))-1;
  let items=[], signature=null;
  const heading=element('div','calendar-toolbar');
  const previous=element('button','calendar-arrow','‹'), next=element('button','calendar-arrow','›');
  const title=element('h3','calendar-month'), todayButton=element('button','secondary calendar-today','今日');
  previous.type=next.type=todayButton.type='button';
  previous.setAttribute('aria-label','前の月'); next.setAttribute('aria-label','次の月');
  title.setAttribute('aria-live','polite');
  heading.append(previous,title,next,todayButton);
  const weekdays=element('div','calendar-weekdays');
  ['日','月','火','水','木','金','土'].forEach((day,index)=>weekdays.append(element('span',index===0?'is-sunday':index===6?'is-saturday':'',day)));
  const grid=element('div','calendar-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label','日付を選択');
  const legend=element('div','calendar-legend');
  const detailTitle=element('h3','calendar-detail-title');detailTitle.setAttribute('aria-live','polite');
  const detail=element('div','calendar-agenda');
  const note=element('p','muted calendar-note','Apple連携の予定は、ショートカットで取得した期間のみ表示されます。');
  root.replaceChildren(heading,weekdays,grid,legend,detailTitle,detail,note);
  root.classList.add('schedule-calendar');
  function daily(date) {
    return items.filter(item=>item.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||'') || a.name.localeCompare(b.name,'ja'));
  }
  function drawDetail() {
    const dayItems=daily(selected);
    const date=new Date(`${selected}T00:00:00Z`);
    const label=new Intl.DateTimeFormat('ja-JP',{timeZone:'UTC',month:'long',day:'numeric',weekday:'long'}).format(date);
    detailTitle.textContent=`${label}の予定 · ${dayItems.length}件`;
    detail.replaceChildren();
    if(!dayItems.length)detail.append(element('p','empty-state','この日の予定はありません。'));
    dayItems.forEach(item=>{
      const row=renderItem(item);
      row.classList.add('calendar-event-detail');
      const badge=element('span',`calendar-source calendar-tone-${tone(sourceName(item))}`,sourceName(item));
      row.prepend(badge);
      detail.append(row);
    });
  }
  function draw() {
    title.textContent=`${year}年 ${month+1}月`;
    grid.replaceChildren();
    monthCells(year,month).forEach((cell,index)=>{
      const events=daily(cell.date), button=element('button','calendar-day');
      button.type='button';button.dataset.date=cell.date;
      if(!cell.inMonth)button.classList.add('outside-month');
      if(index%7===0)button.classList.add('is-sunday');
      if(index%7===6)button.classList.add('is-saturday');
      if(cell.date===today)button.classList.add('is-today');
      if(cell.date===selected)button.classList.add('is-selected');
      button.setAttribute('aria-pressed',String(cell.date===selected));
      if(cell.date===today)button.setAttribute('aria-current','date');
      button.setAttribute('aria-label',`${cell.date}、予定${events.length}件${events.length?'、'+events.map(item=>`${item.time||'終日'} ${item.name}`).join('、'):''}`);
      button.append(element('span','calendar-day-number',String(cell.day)));
      events.slice(0,2).forEach(item=>button.append(element('span',`calendar-chip calendar-tone-${tone(sourceName(item))}`,`${item.time?item.time.slice(0,5)+' ':''}${item.name}`)));
      if(events.length>2)button.append(element('span','calendar-more',`＋${events.length-2}件`));
      button.onclick=()=>{
        selected=cell.date;
        if(!cell.inMonth){year=Number(selected.slice(0,4));month=Number(selected.slice(5,7))-1;}
        draw();
        [...grid.children].find(node=>node.dataset.date===selected)?.focus({preventScroll:true});
      };
      grid.append(button);
    });
    legend.replaceChildren();
    const names=[...new Set(items.filter(item=>item.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)).map(sourceName))];
    names.forEach(name=>legend.append(element('span',`calendar-source calendar-tone-${tone(name)}`,name)));
    drawDetail();
  }
  function move(delta) {
    const date=new Date(Date.UTC(year,month+delta,1));
    year=date.getUTCFullYear();month=date.getUTCMonth();
    const selectedDay=Math.min(Number(selected.slice(8)),new Date(Date.UTC(year,month+1,0)).getUTCDate());
    selected=key(year,month,selectedDay);draw();
  }
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  todayButton.onclick=()=>{today=tokyoToday();selected=today;year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;draw();};
  draw();
  return {
    update(nextItems) {
      const nextSignature=JSON.stringify(nextItems), newToday=tokyoToday();
      if(signature===nextSignature && newToday===today)return;
      signature=nextSignature;today=newToday;items=nextItems;draw();
    },
    reset() {items=[];signature=null;today=tokyoToday();selected=today;year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;draw();},
  };
}
